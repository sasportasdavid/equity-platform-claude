import { ImageResponse } from 'next/og';

export const runtime = 'edge';

/**
 * Open Graph image generator — Site public V1 (PR #50).
 *
 * Génère dynamiquement une image OG 1200x630 avec le branding Capiwise.
 * Usage : `/api/og?title=...&eyebrow=...`.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? 'Capiwise';
  const eyebrow = searchParams.get('eyebrow') ?? 'Plateforme française d’actionnariat salarié';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #faf8f3 0%, #f1e2c9 100%)',
        padding: '64px',
        fontFamily: 'serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            background: '#b8865b',
            color: '#faf8f3',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            fontWeight: 700,
          }}
        >
          C
        </div>
        <div
          style={{
            fontSize: '32px',
            color: '#0b1838',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          Capiwise
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              fontSize: '20px',
              color: '#8c5f36',
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              fontWeight: 600,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              fontSize: '72px',
              color: '#0b1838',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              maxWidth: '900px',
            }}
          >
            {title}
          </div>
          <div
            style={{
              width: '64px',
              height: '4px',
              background: '#b8865b',
              marginTop: '8px',
            }}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: '#5b6788',
          fontSize: '20px',
          fontFamily: 'sans-serif',
        }}
      >
        <span>capiwise.fr</span>
        <span>BSPCE · AGA · SO · RSU · BSA</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
