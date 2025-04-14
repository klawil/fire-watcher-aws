'use client';

import { useLayoutEffect } from 'react';
import { SwaggerUIBundle } from 'swagger-ui-dist';
import 'swagger-ui-dist/swagger-ui.css';
import 'swagger-themes/themes/dark.css';

export default function ApiDocPage({
  spec,
}: {
  spec: { [propName: string]: unknown };
}) {
  useLayoutEffect(() => {
    SwaggerUIBundle({
      spec,
      dom_id: '#myDomId',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.base,
        SwaggerUIBundle.presets.apis,
      ],
    });
  });

  return <div id='myDomId'></div>;
}
