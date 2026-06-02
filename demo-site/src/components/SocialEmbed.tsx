// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

interface SocialEmbedProps {
  videoId: string;
  title?: string;
}

export default function SocialEmbed({
  videoId,
  title = "Video review",
}: SocialEmbedProps) {
  return (
    <div className="my-4 aspect-video w-full max-w-2xl overflow-hidden rounded border border-stone-200">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}
