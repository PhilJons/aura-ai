'use client';

import Link from 'next/link';
import { memo, Children, isValidElement } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';
import { cn } from '@/lib/utils';

const components: Partial<Components> = {
  // @ts-expect-error
  code: ({ node, inline, className, children, ...props }) => {
    const content = String(children).replace(/\n$/, '');
    const codeClassName = className || '';
    
    return (
      <CodeBlock
        node={node}
        inline={!!inline}
        className={codeClassName}
        {...props}
      >
        {content}
      </CodeBlock>
    );
  },
  // Handle paragraphs to prevent invalid nesting
  p: ({ children }) => {
    // Check if children contains only a code block
    const childrenArray = Children.toArray(children);
    if (childrenArray.length === 1 && isValidElement(childrenArray[0])) {
      const child = childrenArray[0];
      if (child.type === CodeBlock || (child.props && child.props.node?.tagName === 'code')) {
        return <>{children}</>;
      }
    }
    return <p className="mb-4">{children}</p>;
  },
  // Handle pre tags
  pre: ({ children }) => {
    // Check if children is a CodeBlock
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
        {children}
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
