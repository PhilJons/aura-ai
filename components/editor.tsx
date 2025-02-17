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
  const contentRef = useRef<string>(content);
  const isInitializedRef = useRef<boolean>(false);

  // Initialize editor only once when container is available
  useEffect(() => {
    if (!containerRef.current || editorRef.current || !content) {
      return;
    }

    debug('document', 'Creating editor instance', {
      hasContainer: true,
      contentLength: content.length,
      isFirstInitialization: !isInitializedRef.current
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
      dispatchTransaction: (transaction) => {
        handleTransaction({
          transaction,
          editorRef,
          onSaveContent,
        });
      },
    });

    isInitializedRef.current = true;
    contentRef.current = content;

    debug('document', 'Editor instance created', {
      hasEditor: true,
      stateDocSize: state.doc.content.size
    });

    // Cleanup function
    return () => {
      if (editorRef.current) {
        debug('document', 'Destroying editor instance', {
          hasEditor: true,
          contentLength: contentRef.current.length
        });
        editorRef.current.destroy();
        editorRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [content, onSaveContent]);

  // Handle content updates only when content changes and editor exists
  useEffect(() => {
    if (!editorRef.current || !content || content === contentRef.current) {
      return;
    }

    debug('document', 'Content update', {
      hasEditor: true,
      currentContentLength: contentRef.current.length,
      newContentLength: content.length,
      status,
      isDifferent: content !== contentRef.current
    });

    const newDocument = buildDocumentFromContent(content);
    const transaction = editorRef.current.state.tr.replaceWith(
      0,
      editorRef.current.state.doc.content.size,
      newDocument.content,
    );

    transaction.setMeta('no-save', true);
    editorRef.current.dispatch(transaction);
    contentRef.current = content;
  }, [content, status]);

  // Handle suggestions only when they change and editor exists
  useEffect(() => {
    if (!editorRef.current?.state.doc || !content || suggestions.length === 0) {
      return;
    }

    debug('document', 'Processing suggestions', {
      hasEditor: true,
      suggestionCount: suggestions.length
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
