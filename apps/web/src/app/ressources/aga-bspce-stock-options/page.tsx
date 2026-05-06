import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import { ArticleLayout } from '../_components';

export const metadata: Metadata = {
  title: 'AGA vs BSPCE vs Stock Options vs RSU vs BSA',
  description:
    'Tableau comparatif des 5 instruments d’actionnariat salarié français : éligibilité, fiscalité, contraintes, cas d’usage. Quel instrument pour quelle situation ?',
  alternates: {
    canonical: 'https://www.capiwise.fr/ressources/aga-bspce-stock-options',
  },
};

export default function ComparatifInstrumentsPage() {
  return (
    <MarketingLayout>
      <ArticleLayout
        category="Guide · Comparaison instruments"
        title="AGA vs BSPCE vs Stock Options vs RSU vs BSA"
        intro="Cinq instruments, cinq régimes fiscaux, cinq cas d’usage. Comparatif détaillé pour choisir le bon instrument selon votre stade et votre profil bénéficiaire."
        readTime="8 min"
      >
        <h2>Tableau comparatif</h2>
        <table>
          <thead>
            <tr>
              <th>Critère</th>
              <th>BSPCE</th>
              <th>SO</th>
              <th>AGA</th>
              <th>RSU</th>
              <th>BSA</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Éligibilité société</td>
              <td>Restrictive</td>
              <td>Libre</td>
              <td>SA / SAS</td>
              <td>Libre</td>
              <td>Libre</td>
            </tr>
            <tr>
              <td>Charges sociales société</td>
              <td>0 %</td>
              <td>~47 %</td>
              <td>20 %</td>
              <td>20 %</td>
              <td>0 %</td>
            </tr>
            <tr>
              <td>Cliff minimum</td>
              <td>Libre</td>
              <td>Libre</td>
              <td>1 an légal</td>
              <td>2 ans légal</td>
              <td>Libre</td>
            </tr>
            <tr>
              <td>Plafond légal</td>
              <td>—</td>
              <td>—</td>
              <td>30 % capital</td>
              <td>—</td>
              <td>—</td>
            </tr>
            <tr>
              <td>Fiscalité bénéficiaire (long terme)</td>
              <td>30 % PFU</td>
              <td>Barème IR</td>
              <td>30 % PFU + IR</td>
              <td>30 % PFU + IR</td>
              <td>30 % PFU</td>
            </tr>
          </tbody>
        </table>

        <h2>Cas d’usage par instrument</h2>
        <h3>BSPCE</h3>
        <p>
          <strong>Pour qui</strong> : startups Tech &lt; 15 ans, bénéficiaires salariés ou
          dirigeants. <strong>Pourquoi</strong> : zéro charges sociales société + fiscalité PFU
          bénéficiaire. <strong>Quand</strong> : amorçage et Série A, première vague de key hires.
        </p>
        <h3>Stock Options (SO)</h3>
        <p>
          <strong>Pour qui</strong> : sociétés &gt; 15 ans ou hors critères BSPCE, dirigeants /
          mandataires non éligibles BSPCE. <strong>Pourquoi</strong> : flexibilité maximale.
          <strong> Quand</strong> : groupes établis, holdings.
        </p>
        <h3>AGA (Actions Gratuites)</h3>
        <p>
          <strong>Pour qui</strong> : SA et SAS, plans de fidélisation long terme.{' '}
          <strong>Pourquoi</strong> : bénéficiaire ne paie rien à l’acquisition (vs SO/BSPCE qui
          demandent un cash exercise). <strong>Quand</strong> : C-level, profils stratégiques, plans
          Performance avec conditions TSR.
        </p>
        <h3>RSU (Restricted Stock Units)</h3>
        <p>
          <strong>Pour qui</strong> : sociétés cotées ou en pre-IPO. <strong>Pourquoi</strong> :
          standard international, bien compris par les talents internationaux.{' '}
          <strong>Quand</strong> : late-stage, IPO en vue.
        </p>
        <h3>BSA (Bons de Souscription d’Actions)</h3>
        <p>
          <strong>Pour qui</strong> : tiers non salariés (advisors, partners, board), bénéficiaires
          non éligibles BSPCE. <strong>Pourquoi</strong> : zéro charges sociales société, mais pas
          de régime fiscal préférentiel pour le bénéficiaire (sauf BSA-Air).
          <strong> Quand</strong> : advisors externes, board members.
        </p>

        <h2>Décision : quel instrument pour quelle situation ?</h2>
        <p>
          <strong>Startup Tech early-stage</strong> : BSPCE pour les key hires, BSA pour les
          advisors externes.
        </p>
        <p>
          <strong>Scale-up Série B+</strong> : mix BSPCE (équipes opérationnelles) + AGA (C-level
          avec conditions performance).
        </p>
        <p>
          <strong>ETI / Groupe</strong> : SO pour les dirigeants, AGA pour les plans Performance,
          RSU pour les talents internationaux.
        </p>

        <h2>Capiwise gère les 5 nativement</h2>
        <p>
          Pas de bricolage. Le wizard de création de plan adapte les contraintes légales et les
          calculs IFRS 2 selon l’instrument choisi. La validation art. 163 bis G CGI est automatique
          pour les BSPCE, le cap 30 % pour les AGA, etc.
        </p>
        <p>
          <a href="/produit/plans">→ Module Création de plans</a>
        </p>
      </ArticleLayout>
    </MarketingLayout>
  );
}
