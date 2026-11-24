'use client';
// Last resort when the root layout itself fails: no providers (so no i18n
// messages), so it carries both languages. Grayscale, never black.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "'Area Normal', 'Area', Arial, sans-serif",
          color: '#3d3d3d',
          background: '#fff',
          padding: 24,
        }}
      >
        <h1>Something went wrong</h1>
        <p lang="es">Algo salió mal</p>
        <p>Your saved information is safe. Try again in a moment.</p>
        <p lang="es">Su información guardada está segura. Vuelva a intentarlo en un momento.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: 44,
            padding: '0 20px',
            borderRadius: 999,
            border: '1px solid #3d3d3d',
            background: '#fff',
            color: '#3d3d3d',
            font: 'inherit',
          }}
        >
          Try again / Intentar de nuevo
        </button>
      </body>
    </html>
  );
}
