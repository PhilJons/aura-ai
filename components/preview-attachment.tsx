import type { Attachment } from 'ai';

import { LoaderIcon, CrossSmallIcon } from './icons';
import { Button } from './ui/button';

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;

  // Extract the original filename from the pathname if it exists
  const displayName = name?.split('/').pop() || 'Untitled';

  return (
    <div className="flex flex-col gap-2 group">
      <div className="w-20 h-16 aspect-video bg-muted rounded-md relative flex flex-col items-center justify-center overflow-visible">
        {contentType ? (
          contentType.startsWith('image') ? (
            // NOTE: it is recommended to use next/image for images
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={displayName}
              className="rounded-md size-full object-cover"
            />
          ) : (
            <div className="" />
          )
        ) : (
          <div className="" />
        )}

        {isUploading && (
          <div className="animate-spin absolute text-zinc-500">
            <LoaderIcon />
          </div>
        )}

        {!isUploading && onRemove && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute -top-2 -right-2 size-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-background hover:bg-background border dark:border-zinc-700 z-10 shadow-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
          >
            <CrossSmallIcon size={12} />
          </Button>
        )}
      </div>
      <div className="text-xs text-zinc-500 max-w-16 truncate">{displayName}</div>
    </div>
  );
};
