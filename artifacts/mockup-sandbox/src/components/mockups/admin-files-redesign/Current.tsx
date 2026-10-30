import { useEffect } from 'react';
import './_group.css';
import adminHtml from './admin.html?raw';

const ADMIN_MARKUP = adminHtml
  .match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
  ?.replace(/\s*<script type="module" src="\.\/admin\.js"><\/script>/i, '') ?? '';

export function Current() {
  useEffect(() => {
    // The original vanilla module is intentionally kept as JavaScript.
    // @ts-ignore -- no declaration is needed for its DOM-initializing side effect.
    import('./admin-preview.js');
  }, []);

  return (
    <div
      className="admin-console-preview min-h-screen"
      dangerouslySetInnerHTML={{ __html: ADMIN_MARKUP }}
    />
  );
}
