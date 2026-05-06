/**
 * Smoke tests pour les composants marketing — Site public V1 (PR #50).
 *
 * V1 : tests de validation logique (sans rendu React) pour vérifier
 * que les types s'exportent correctement et les helpers fonctionnent.
 * Tests visuels via Playwright à venir post-merge (cf brief §10 DOD).
 */

import { describe, expect, it } from 'vitest';

describe('Marketing — module exports', () => {
  it('layout exports MarketingLayout, PublicHeader, PublicFooter', async () => {
    const mod = await import('../layout');
    expect(typeof mod.MarketingLayout).toBe('function');
    expect(typeof mod.PublicHeader).toBe('function');
    expect(typeof mod.PublicFooter).toBe('function');
  });

  it('sections exports all hero variants', async () => {
    const mod = await import('../sections');
    expect(typeof mod.HeroLarge).toBe('function');
    expect(typeof mod.HeroSmall).toBe('function');
    expect(typeof mod.HeroSplit).toBe('function');
    expect(typeof mod.SectionHeader).toBe('function');
    expect(typeof mod.FeatureGrid).toBe('function');
    expect(typeof mod.BigFeature).toBe('function');
    expect(typeof mod.StatsBlock).toBe('function');
    expect(typeof mod.CTABanner).toBe('function');
    expect(typeof mod.TrustBadges).toBe('function');
    expect(typeof mod.MarketingSection).toBe('function');
  });

  it('pricing exports PricingCard, PricingTable, ComparisonTable', async () => {
    const mod = await import('../pricing');
    expect(typeof mod.PricingCard).toBe('function');
    expect(typeof mod.PricingTable).toBe('function');
    expect(typeof mod.ComparisonTable).toBe('function');
  });

  it('faq exports FAQAccordion, BlogCard', async () => {
    const mod = await import('../faq');
    expect(typeof mod.FAQAccordion).toBe('function');
    expect(typeof mod.BlogCard).toBe('function');
  });

  it('testimonials exports TestimonialCard, TestimonialGrid, LogoCloud', async () => {
    const mod = await import('../testimonials');
    expect(typeof mod.TestimonialCard).toBe('function');
    expect(typeof mod.TestimonialGrid).toBe('function');
    expect(typeof mod.LogoCloud).toBe('function');
  });

  it('visuals exports all SVG visuals', async () => {
    const mod = await import('../visuals');
    expect(typeof mod.HomepageDashboardMockup).toBe('function');
    expect(typeof mod.PlansVisual).toBe('function');
    expect(typeof mod.ApprovalVisual).toBe('function');
    expect(typeof mod.MonteCarloVisual).toBe('function');
    expect(typeof mod.AuditVisual).toBe('function');
    expect(typeof mod.PortalVisual).toBe('function');
    expect(typeof mod.CapTableVisual).toBe('function');
    expect(typeof mod.SignatureVisual).toBe('function');
    expect(typeof mod.ComplianceVisual).toBe('function');
    expect(typeof mod.ExerciseVisual).toBe('function');
  });

  it('product-page exports ProductPage', async () => {
    const mod = await import('../product-page');
    expect(typeof mod.ProductPage).toBe('function');
  });

  it('brand exports CapiwiseMark', async () => {
    const mod = await import('../brand');
    expect(typeof mod.CapiwiseMark).toBe('function');
  });
});
