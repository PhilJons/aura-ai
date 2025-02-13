'use client';

import Link from 'next/link';
import React, { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './code-block';

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
    const childrenArray = React.Children.toArray(children);
    if (childrenArray.length === 1 && React.isValidElement(childrenArray[0])) {
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
    const childrenArray = React.Children.toArray(children);
    if (childrenArray.length === 1 && React.isValidElement(childrenArray[0])) {
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
  li: ({ node, children, ...props }) => {
    return (
      <li className="py-1" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="list-decimal list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error
      <Link
        className="text-blue-500 hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="text-3xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="text-xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4 className="text-lg font-semibold mt-6 mb-2" {...props}>
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5 className="text-base font-semibold mt-6 mb-2" {...props}>
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6 className="text-sm font-semibold mt-6 mb-2" {...props}>
        {children}
      </h6>
    );
  },
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);
