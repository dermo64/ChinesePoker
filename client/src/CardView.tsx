import type { Card } from './types';
import type React from 'react';

function cardImageSrc(card: Card) {
  const rank = card[0];
  const suit = card[1];
  return `/cards/${rank}${suit}.svg`;
}

export function CardBack(props: { className?: string }) {
  const { className } = props;
  return (
    <div className={`card card-back ${className ?? ''}`.trim()} aria-hidden="true">
      <img className="card-img card-back-img" src="/cards/back.svg" alt="Card back" draggable={false} />
    </div>
  );
}

export default function CardView(props: {
  card: Card;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>, card?: Card) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  selected?: boolean;
}) {
  const { card, draggable, onDragStart, onClick, onDoubleClick, selected } = props;
  const imageSrc = cardImageSrc(card);

  return (
    <div
      className={`card ${draggable ? 'card-draggable' : ''} ${selected ? 'card-selected' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(e, card);
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      title={card}
    >
      <img className="card-img" src={imageSrc} alt={card} draggable={false} />
    </div>
  );
}
