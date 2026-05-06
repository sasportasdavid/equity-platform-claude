import { describe, expect, it } from 'vitest';
import { _buildMailtoForTests as buildMailto } from '../SupportContactCTA';

describe('SupportContactCTA — buildMailto', () => {
  it('produces a mailto URL with subject and body', () => {
    const href = buildMailto({
      email: 'david@capiwise.fr',
      feature: 'Configuration compliance custom',
    });

    expect(href.startsWith('mailto:david@capiwise.fr?')).toBe(true);
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('subject')).toBe('[Capiwise V1.0] Configuration compliance custom');
    expect(params.get('body')).toContain('Bonjour David');
    expect(params.get('body')).toContain('configuration compliance custom');
    expect(params.get('body')).toContain('Merci !');
  });

  it('includes context line when provided', () => {
    const href = buildMailto({
      email: 'support@example.com',
      feature: 'Audit log export',
      context: 'page=/dashboard/audit-log; org_id=abc-123',
    });

    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('body')).toContain('Contexte : page=/dashboard/audit-log');
    expect(params.get('body')).toContain('org_id=abc-123');
  });

  it('omits Contexte line when context is empty', () => {
    const href = buildMailto({
      email: 'a@b.com',
      feature: 'Help',
    });

    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('body')).not.toContain('Contexte');
  });

  it('lowercases the feature in the body sentence', () => {
    const href = buildMailto({
      email: 'a@b.com',
      feature: 'Templates Additionnels',
    });

    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('body')).toContain('je voulais templates additionnels.');
  });

  it('escapes special chars via URLSearchParams', () => {
    const href = buildMailto({
      email: 'a@b.com',
      feature: 'Compliance & approvals',
    });

    expect(href).toContain('%26'); // & encoded
  });
});
