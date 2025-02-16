'use client';

import { exampleSetup } from 'prosemirror-example-setup';
import { inputRules } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import React, { memo, useEffect, useRef } from 'react';

import type { Suggestion } from '@/lib/db/schema';
import {
  documentSchema,
  handleTransaction,
  headingRule,
} from '@/lib/editor/config';
import {
  buildContentFromDocument,
  buildDocumentFromContent,
  createDecorations,
} from '@/lib/editor/functions';
import {
  projectWithPositions,
  suggestionsPlugin,
  suggestionsPluginKey,
} from '@/lib/editor/suggestions';
import { debug } from '@/lib/utils/debug';

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: 'streaming' | 'idle';
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Array<Suggestion>;
};

function PureEditor({
  content,
  isCurrentVersion,
  currentVersionIndex,
  status,
  onSaveContent,
  suggestions,
}: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);

  debug('document', 'Editor component initialization', {
    contentLength: content?.length,
    isCurrentVersion,
    currentVersionIndex,
    status,
    hasSuggestions: suggestions.length > 0,
    contentPreview: content?.substring(0, 100) + '...',
    isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1,
    hasContainer: !!containerRef.current,
    hasEditor: !!editorRef.current
  });

  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      debug('document', 'Creating new editor instance', {
        hasContainer: !!containerRef.current,
        contentLength: content?.length,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      const state = EditorState.create({
        doc: buildDocumentFromContent(content),
        plugins: [
          ...exampleSetup({ schema: documentSchema, menuBar: false }),
          inputRules({
            rules: [
              headingRule(1),
              headingRule(2),
              headingRule(3),
              headingRule(4),
              headingRule(5),
              headingRule(6),
            ],
          }),
          suggestionsPlugin,
        ],
      });

      editorRef.current = new EditorView(containerRef.current, {
        state,
      });

      debug('document', 'Editor instance created', {
        hasEditor: !!editorRef.current,
        stateDocSize: state.doc.content.size,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });
    }

    return () => {
      if (editorRef.current) {
        debug('document', 'Destroying editor instance', {
          hasEditor: true,
          isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
        });
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // NOTE: we only want to run this effect once
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (editorRef.current) {
      debug('document', 'Setting up transaction handler', {
        hasEditor: true,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      editorRef.current.setProps({
        dispatchTransaction: (transaction) => {
          handleTransaction({
            transaction,
            editorRef,
            onSaveContent,
          });
        },
      });
    }
  }, [onSaveContent]);

  useEffect(() => {
    if (editorRef.current && content) {
      const currentContent = buildContentFromDocument(
        editorRef.current.state.doc,
      );

      debug('document', 'Content update check', {
        hasEditor: true,
        currentContentLength: currentContent.length,
        newContentLength: content.length,
        status,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      if (status === 'streaming') {
        const newDocument = buildDocumentFromContent(content);

        debug('document', 'Streaming content update', {
          hasEditor: true,
          newDocumentSize: newDocument.content.size,
          isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
        });

        const transaction = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        );

        transaction.setMeta('no-save', true);
        editorRef.current.dispatch(transaction);
        return;
      }

      if (currentContent !== content) {
        const newDocument = buildDocumentFromContent(content);

        debug('document', 'Non-streaming content update', {
          hasEditor: true,
          newDocumentSize: newDocument.content.size,
          isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
        });

        const transaction = editorRef.current.state.tr.replaceWith(
          0,
          editorRef.current.state.doc.content.size,
          newDocument.content,
        );

        transaction.setMeta('no-save', true);
        editorRef.current.dispatch(transaction);
      }
    }
  }, [content, status]);

  useEffect(() => {
    if (editorRef.current?.state.doc && content) {
      debug('document', 'Processing suggestions', {
        hasEditor: true,
        suggestionCount: suggestions.length,
        isReload: typeof window !== 'undefined' && window.performance?.navigation?.type === 1
      });

      const projectedSuggestions = projectWithPositions(
        editorRef.current.state.doc,
        suggestions,
      ).filter(
        (suggestion) => suggestion.selectionStart && suggestion.selectionEnd,
      );

      const decorations = createDecorations(
        projectedSuggestions,
        editorRef.current,
      );

      const transaction = editorRef.current.state.tr;
      transaction.setMeta(suggestionsPluginKey, { decorations });
      editorRef.current.dispatch(transaction);
    }
  }, [suggestions, content]);

  return (
    <div className="relative prose dark:prose-invert" ref={containerRef} />
  );
}

function areEqual(prevProps: EditorProps, nextProps: EditorProps) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === 'streaming' && nextProps.status === 'streaming') &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const Editor = memo(PureEditor, areEqual);
