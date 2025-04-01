'use client';

import Link from 'next/link';
import { memo, Children, isValidElement, createElement, } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { cn } from '@/lib/utils';

// Helper function to process children and style citations
const processChildrenForCitations = (children: React.ReactNode): React.ReactNode => {
  return Children.map(children, (child) => {
    if (typeof child === 'string') {
      // Match standalone citation numbers or numbers at the end of text with optional period
      // This regex looks for numbers that are either standalone or at the end of text
      // Examples: "text 1", "text 2.", "3", "4."
      const citationRegex = /(\d+)\.?$/;
      const match = child.match(citationRegex);
      
      if (match) {
        // Find the position where the citation number starts
        const citationNumber = match[1];
        const positionOfCitation = child.lastIndexOf(citationNumber);
        
        // Split the text into content before citation and the citation itself
        const textBeforeCitation = child.substring(0, positionOfCitation);
        
        // Only process if it looks like a reference (standalone number or at end of text)
        // Avoid processing numbers that are part of sentences like "in 2023"
        if (textBeforeCitation.trim() === '' || textBeforeCitation.endsWith(' ')) {
          return (
            <>
              {textBeforeCitation}
              <span className="inline-flex items-center justify-center size-5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-full text-xs font-medium mx-0.5">
                {citationNumber}
              </span>
            </>
          );
        }
      }
      return child; // Return original string if no citation found
    }

    // If the child is a React element, process its children recursively
    if (isValidElement(child) && child.props.children) {
      // Clone the element to avoid modifying the original props
      // Pass the processed children to the cloned element
      return createElement(
        child.type,
        { ...child.props },
        processChildrenForCitations(child.props.children)
      );
    }

    // Return other types of children (like numbers, null, etc.) as is
    return child;
  });
};

// Create a wrapper component to handle code blocks
const MarkdownCode = ({ node, inline, className, children }: any) => {
  const content = String(children).replace(/\n$/, '');
  const codeClassName = className || '';
  
  return (
    <CodeBlock
      node={node}
      inline={!!inline}
      className={codeClassName}
    >
      {content}
    </CodeBlock>
  );
};

const components: Partial<Components> = {
  code: MarkdownCode,
  // Handle paragraphs, apply citation styling
  p: ({ children }) => {
    // Preserve existing logic for code blocks within paragraphs
    const childrenArray = Children.toArray(children);
    if (childrenArray.length === 1 && isValidElement(childrenArray[0])) {
      const child = childrenArray[0];
      if (child.type === CodeBlock || (child.props && child.props.node?.tagName === 'code')) {
        return <>{children}</>;
      }
    }
    // Apply citation styling to paragraph children
    return <p className="mb-4">{processChildrenForCitations(children)}</p>;
  },
  // Handle list items, apply citation styling
  li: ({ children, ...props }) => {
    // Apply citation styling to list item children
    return <li {...props}>{processChildrenForCitations(children)}</li>;
  },
  // Handle pre tags
  pre: ({ children }) => {
    const childrenArray = Children.toArray(children);
    if (childrenArray.length === 1 && isValidElement(childrenArray[0])) {
      const child = childrenArray[0];
      if (child.type === CodeBlock || (child.props && child.props.node?.tagName === 'code')) {
        return children;
      }
    }
    return <div className="my-4">{children}</div>;
  },
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ol>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-disc list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  a: ({ node, children, href, ...props }) => {
    if (href?.startsWith('/')) {
      return (
        <Link href={href} {...props}>
          {children}
        </Link>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
        {...props}
      >
        {processChildrenForCitations(children)}
      </a>
    );
  },
};

export const Markdown = memo(
  ({ children, className }: { children: string; className?: string }) => {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        className={cn("prose dark:prose-invert max-w-none", className)}
      >
        {children}
      </ReactMarkdown>
    );
  },
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Markdown.displayName = 'Markdown';
