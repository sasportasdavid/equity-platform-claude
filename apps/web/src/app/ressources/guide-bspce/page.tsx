import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import { ArticleLayout } from '../_components';

export const metadata: Metadata = {
  title: 'Le guide complet du BSPCE 2026',
  description:
    'Tout sur les BSPCE en France 2026 : éligibilité société (art. 163 bis G CGI), fiscalité salarié avant/après 3 ans, vesting, levée d’options, comparaison vs SO/AGA.',
  alternates: { canonical: 'https://www.capiwise.fr/ressources/guide-bspce' },
};

export default function GuideBspcePage() {
  return (
    <MarketingLayout>
      <ArticleLayout
        category="Guide pillar · BSPCE"
        title="Le guide complet du BSPCE 2026"
        intro="Bons de Souscription de Parts de Créateur d’Entreprise. L’instrument d’actionnariat salarié français le plus utilisé par les startups Tech. Guide complet : éligibilité, vesting, fiscalité, levée d’options."
        readTime="15 min"
      >
        <h2>Sommaire</h2>
        <ol>
          <li>Qu’est-ce qu’un BSPCE ?</li>
          <li>Conditions d’éligibilité (art. 163 bis G CGI)</li>
          <li>Comment fixer le prix d’exercice (FMV)</li>
          <li>Vesting et cliff : quel calendrier choisir ?</li>
          <li>Fiscalité salarié : avant et après 3 ans</li>
          <li>Fiscalité société</li>
          <li>Comment digitaliser la gestion ?</li>
          <li>BSPCE vs SO vs AGA vs BSA</li>
        </ol>

        <h2 id="quest-ce-quun-bspce">Qu’est-ce qu’un BSPCE ?</h2>
        <p>
          Le BSPCE (Bon de Souscription de Parts de Créateur d’Entreprise) est un instrument
          d’actionnariat salarié spécifique au droit français, créé par la loi de finances pour 1998
          (art. 163 bis G du CGI). Il permet à une société de proposer à ses salariés et dirigeants
          l’achat d’actions à un prix fixé à l’avance, dans des conditions fiscales avantageuses.
        </p>
        <p>
          <em>
            Contrairement aux Stock Options (SO) classiques, les BSPCE bénéficient d’un régime
            fiscal préférentiel pour le bénéficiaire ET pour la société.
          </em>
        </p>

        <h2 id="eligibilite">Conditions d’éligibilité (art. 163 bis G CGI)</h2>
        <p>
          Pour qu’une société puisse émettre des BSPCE, elle doit cumulativement remplir plusieurs
          conditions :
        </p>
        <ul>
          <li>
            <strong>Âge</strong> : moins de 15 ans depuis sa création (au moment de l’émission)
          </li>
          <li>
            <strong>Capitalisation</strong> : moins de 150 M€ de capitalisation boursière (si cotée)
            ou de capitaux propres (si non cotée)
          </li>
          <li>
            <strong>Régime fiscal</strong> : société soumise à l’IS (impôt sur les sociétés)
          </li>
          <li>
            <strong>Détention</strong> : 50 % du capital détenu directement ou indirectement par des
            personnes physiques
          </li>
          <li>
            <strong>Bénéficiaire</strong> : salarié, mandataire social, ou membre du conseil
            d’administration / surveillance
          </li>
        </ul>
        <p>
          [Skeleton — section à compléter par le rédacteur juridique. Inclure exemples concrets, cas
          d’exclusion, et références jurisprudentielles.]
        </p>

        <h2 id="prix-exercice">Comment fixer le prix d’exercice (FMV)</h2>
        <p>
          Le prix d’exercice du BSPCE doit correspondre à la <strong>juste valeur</strong> (Fair
          Market Value) de l’action à la date d’attribution. Plusieurs méthodes sont acceptées par
          l’administration fiscale :
        </p>
        <ul>
          <li>
            <strong>Méthode des transactions comparables</strong> : prix d’émission de la dernière
            levée de fonds (Série A, B, etc.)
          </li>
          <li>
            <strong>Méthode du DCF</strong> : actualisation des flux de trésorerie futurs
          </li>
          <li>
            <strong>Méthode des multiples</strong> : multiples sectoriels (EBITDA, revenue)
          </li>
        </ul>
        <p>
          [Lorem ipsum — section à compléter avec exemples chiffrés et tableau comparatif des
          méthodes.]
        </p>

        <h2 id="vesting">Vesting et cliff : quel calendrier choisir ?</h2>
        <p>
          Le vesting définit la période d’acquisition progressive des BSPCE par le bénéficiaire. Les
          calendriers les plus courants en France :
        </p>
        <ul>
          <li>
            <strong>4 ans / 1 an cliff</strong> : standard Tech français. 25 % au cliff de 1 an,
            puis 1/48ᵉ par mois
          </li>
          <li>
            <strong>3 ans / 1 an cliff</strong> : variante plus rapide pour les profils key hires
            senior
          </li>
          <li>
            <strong>Vesting conditionnel</strong> : conditionné à des KPI (ARR, EBITDA, TSR)
          </li>
        </ul>
        <p>[Skeleton — section à compléter avec recommandations par profil bénéficiaire.]</p>

        <h2 id="fiscalite-salarie">Fiscalité salarié : avant et après 3 ans</h2>
        <p>La fiscalité du BSPCE est différente selon la durée de détention :</p>
        <h3>Avant 3 ans de présence dans la société</h3>
        <p>
          Plus-value imposée au taux forfaitaire de 30 % (12,8 % d’IR + 17,2 % de prélèvements
          sociaux).
        </p>
        <h3>Après 3 ans de présence dans la société</h3>
        <p>
          Plus-value imposée au taux forfaitaire de 30 % (PFU classique). Régime alternatif possible
          : barème progressif IR + 17,2 % PS.
        </p>
        <p>
          [Skeleton — section à compléter avec exemples chiffrés et tableaux comparatifs PFU vs
          barème progressif selon TMI.]
        </p>

        <h2 id="fiscalite-societe">Fiscalité société</h2>
        <p>
          Pour la société émettrice : pas de charge sociale URSSAF (vs 47 % de charges patronales
          pour des SO non BSPCE). Inscription en charges déductibles selon IFRS 2.
        </p>
        <p>[Skeleton — section à compléter.]</p>

        <h2 id="digitalisation">Comment digitaliser la gestion ?</h2>
        <p>
          Capiwise gère nativement les BSPCE depuis la création du plan jusqu’à la levée d’options
          et la mise à jour du cap table. Les contraintes art. 163 bis G CGI sont pré-câblées dans
          le wizard de création de plan : impossible de créer un BSPCE pour une société non
          éligible.
        </p>
        <p>
          La fiscalité avant/après 3 ans est calculée nativement par notre simulateur de départ : le
          bénéficiaire visualise instantanément son net-net en cas de levée à différents horizons.
        </p>

        <h2 id="comparaison">BSPCE vs SO vs AGA vs BSA</h2>
        <table>
          <thead>
            <tr>
              <th>Critère</th>
              <th>BSPCE</th>
              <th>SO</th>
              <th>AGA</th>
              <th>BSA</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Éligibilité société</td>
              <td>Restrictive (15 ans, 150M€)</td>
              <td>Toute</td>
              <td>SA / SAS</td>
              <td>Toute</td>
            </tr>
            <tr>
              <td>Charges sociales société</td>
              <td>0 %</td>
              <td>~47 %</td>
              <td>20 %</td>
              <td>0 %</td>
            </tr>
            <tr>
              <td>Fiscalité salarié (long terme)</td>
              <td>30 % PFU</td>
              <td>Barème IR</td>
              <td>30 % PFU</td>
              <td>30 % PFU</td>
            </tr>
            <tr>
              <td>Cliff minimum</td>
              <td>0 (libre)</td>
              <td>0 (libre)</td>
              <td>1 an légal</td>
              <td>0 (libre)</td>
            </tr>
          </tbody>
        </table>
        <p>
          <a href="/ressources/aga-bspce-stock-options">
            → Comparaison détaillée des 5 instruments
          </a>
        </p>
      </ArticleLayout>
    </MarketingLayout>
  );
}
