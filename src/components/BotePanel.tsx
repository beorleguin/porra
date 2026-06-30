import { AppState } from '../domain/types';
import { TRANSLATIONS, Lang } from '../utils/translations';

interface BotePanelProps {
  boteData: AppState['bote'];
  lang: Lang;
}

export function BotePanel({ boteData, lang }: BotePanelProps) {
  const t = TRANSLATIONS[lang];

  if (!boteData) {
    return (
      <div className="card text-center pad-lg">
        <h3>{t.bpTitle}</h3>
        <p>{t.bpNoData}</p>
      </div>
    );
  }

  return (
    <div className="bote-panel">
      {/* 1. TOP CARDS */}
      <div className="bote-summary-grid">
        <div className="card bote-card main-bote-card">
          <div className="card-header-icon">🏆</div>
          <h3>{t.bpTotalAccumulated}</h3>
          <div className="bote-amount-big">{boteData.total}</div>
          <p className="bote-card-sub text-muted">{t.bpTotalDesc}</p>
        </div>

        <div className="card bote-card prize-card gold">
          <div className="card-header-icon">🥇</div>
          <h3>{t.bpFirstPrize}</h3>
          <div className="bote-amount-medium">{boteData.prizes.first}</div>
          <p className="bote-card-sub">{t.bpFirstDesc}</p>
        </div>

        <div className="card bote-card prize-card silver">
          <div className="card-header-icon">🥈</div>
          <h3>{t.bpSecondPrize}</h3>
          <div className="bote-amount-medium">{boteData.prizes.second}</div>
          <p className="bote-card-sub">{t.bpSecondDesc}</p>
        </div>

        <div className="card bote-card prize-card bronze">
          <div className="card-header-icon">🥉</div>
          <h3>{t.bpThirdPrize}</h3>
          <div className="bote-amount-medium">{boteData.prizes.third}</div>
          <p className="bote-card-sub">{t.bpThirdDesc}</p>
        </div>
      </div>

    </div>
  );
}
