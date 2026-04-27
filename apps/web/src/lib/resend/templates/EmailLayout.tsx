import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

/**
 * Layout commun à tous les emails Capiwise.
 * Branding minimal : badge "C" + nom + footer légal.
 *
 * Le `<Preview>` donne le snippet affiché dans les inbox (Gmail, Outlook).
 */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Tailwind>
        <Body className="bg-slate-50 font-sans">
          <Container className="mx-auto max-w-[560px] py-8">
            <Section className="px-6 pb-2">
              <Text className="my-0 text-base font-semibold tracking-tight text-slate-900">
                <span
                  style={{
                    display: 'inline-block',
                    width: 28,
                    height: 28,
                    background: '#3730A3',
                    color: '#fff',
                    borderRadius: 6,
                    textAlign: 'center',
                    lineHeight: '28px',
                    marginRight: 8,
                    fontFamily: 'monospace',
                  }}
                >
                  C
                </span>
                Capiwise
              </Text>
            </Section>

            <Section className="rounded-lg bg-white px-6 py-8 shadow-sm">{children}</Section>

            <Hr className="my-6 border-slate-200" />
            <Text className="text-center text-xs text-slate-500">
              Capiwise · plateforme française de gestion d’actionnariat salarié.
              <br />
              Vous recevez cet email parce qu’une action vous concerne sur la plateforme.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
