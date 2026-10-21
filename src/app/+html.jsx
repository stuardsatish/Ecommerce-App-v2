import { ScrollViewStyleReset } from 'expo-router/html';

/**
 * Web-only root HTML document.
 * Ensures the app fits the browser viewport properly on web with correct meta tags
 * and native-parity scroll behavior.
 */
export default function Root({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root {
                height: 100%;
                width: 100%;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                background-color: #fbf9f8;
              }
              body {
                overflow: hidden;
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}