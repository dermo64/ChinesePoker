import type { Card } from './types';
import type React from 'react';
import CardView from './CardView';

export type ZoneId = 'hand' | 'front' | 'middle' | 'back';

export type DropMeta = { fromIndex?: number; toIndex?: number };

export default function Zone(props: {
  title: string;
  zoneId: ZoneId;
  cards: Card[];
  capacity: number;
  onDropCard: (card: Card, from: ZoneId, to: ZoneId, meta?: DropMeta) => void;
  onDragStartCard: (card: Card, from: ZoneId, fromIndex?: number) => void;
  headerRight?: React.ReactNode;
  enableIndexedDrop?: boolean;
  highlight?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onCardClick?: (card: Card, idx: number) => void;
  className?: string;
}) {
  const {
    title,
    zoneId,
    cards,
    capacity,
    onDropCard,
    onDragStartCard,
    headerRight,
    enableIndexedDrop,
    highlight,
    selected,
    onSelect,
    onCardClick,
    className
  } = props;

  return (
    <div
      className={`zone ${highlight ? 'zone-highlight' : ''} ${selected ? 'zone-selected' : ''} ${className ?? ''}`}
      onClick={onSelect}
      onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const card = e.dataTransfer.getData('text/card');
        const from = e.dataTransfer.getData('text/from') as ZoneId;
        const fromIndexRaw = e.dataTransfer.getData('text/fromIndex');
        const fromIndex = fromIndexRaw ? Number(fromIndexRaw) : undefined;
        if (!card || !from) return;
        onDropCard(card, from, zoneId, enableIndexedDrop ? { fromIndex, toIndex: cards.length } : { fromIndex });
      }}
    >
      <div className="zone-header">
        <div className="zone-title">{title}</div>
        <div className="zone-meta">
          {headerRight}
        </div>
      </div>
      <div className="zone-cards">
        {cards.map((c, idx) => (
          <div
            key={c}
            className="card-slot"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onDragOver={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const card = e.dataTransfer.getData('text/card');
              const from = e.dataTransfer.getData('text/from') as ZoneId;
              const fromIndexRaw = e.dataTransfer.getData('text/fromIndex');
              const fromIndex = fromIndexRaw ? Number(fromIndexRaw) : undefined;
              if (!card || !from) return;
              onDropCard(card, from, zoneId, enableIndexedDrop ? { fromIndex, toIndex: idx } : { fromIndex });
            }}
          >
            <CardView
              card={c}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/card', c);
                e.dataTransfer.setData('text/from', zoneId);
                e.dataTransfer.setData('text/fromIndex', String(idx));
                onDragStartCard(c, zoneId, idx);
              }}
              onClick={() => onCardClick?.(c, idx)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
