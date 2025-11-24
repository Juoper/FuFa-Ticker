import { useRef, useState, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useFetcher } from 'react-router';

interface TimetableEntry {
  id: string;
  startTime: string;
  endTime: string | null;
  day: string;
  content: string;
}

interface TimetableProps {
  entries: TimetableEntry[];
}

const DAYS = [
  { key: 'friday', label: 'Freitag' },
  { key: 'saturday', label: 'Samstag' },
  { key: 'sunday', label: 'Sonntag' },
];

// Timeline from 2:00 to 23:00 (21 hours = 1260 minutes)
const START_HOUR = 2;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;
// Default visible hours (8:00 to 12:00)
const DEFAULT_VISIBLE_START_HOUR = 8;
const DEFAULT_VISIBLE_END_HOUR = 12;

// Convert time string "HH:mm" to minutes from start
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;
  // Handle times after midnight (02:00 is the start of our timeline)
  if (hours < START_HOUR) {
    totalMinutes += 24 * 60;
  }
  return totalMinutes - START_HOUR * 60;
}

// Convert minutes from start to time string "HH:mm"
function minutesToTime(minutes: number): string {
  const totalMinutes = minutes + START_HOUR * 60;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = Math.round(totalMinutes % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

// Calculate position percentage (0-100) based on time
function getPositionPercent(time: string): number {
  const minutes = timeToMinutes(time);
  const totalMinutes = TOTAL_HOURS * 60;
  return (minutes / totalMinutes) * 100;
}

export function Timetable({ entries }: TimetableProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mouseY, setMouseY] = useState<number>(0);
  const [dragPreview, setDragPreview] = useState<{ day: string; time: string } | null>(null);
  const fetcher = useFetcher();
  const dayColumnRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Set initial scroll position to show 8:00 to 12:00 by default
  useEffect(() => {
    if (scrollContainerRef.current) {
      // Calculate scroll position to start at 8:00
      // Hours from start (2:00) to default start (8:00) = 6 hours
      const hoursFromStart = DEFAULT_VISIBLE_START_HOUR - START_HOUR;
      const scrollPercentage = hoursFromStart / TOTAL_HOURS;
      const totalHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTop = totalHeight * scrollPercentage;
    }
  }, []);

  const activeEntry = activeId
    ? entries.find((e) => e.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setDragPreview(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    const entry = entries.find((e) => e.id === active.id);
    if (!entry) {
      setActiveId(null);
      return;
    }

    // Extract day from the droppable id (format: "day-column-{day}")
    const overId = over.id.toString();
    const newDay = overId.replace('day-column-', '');

    // Calculate new time based on Y position within the column
    const dayColumn = dayColumnRefs.current[newDay];
    if (!dayColumn) {
      setActiveId(null);
      return;
    }

    const rect = dayColumn.getBoundingClientRect();
    const relativeY = mouseY - rect.top;
    const percentage = Math.max(0, Math.min(100, (relativeY / rect.height) * 100));
    const totalMinutes = TOTAL_HOURS * 60;
    const newMinutes = Math.round((percentage / 100) * totalMinutes);
    // Snap to 5-minute intervals
    const snappedMinutes = Math.round(newMinutes / 5) * 5;
    const newTime = minutesToTime(snappedMinutes);

    // Only update if something changed
    if (newDay !== entry.day || newTime !== entry.startTime) {
      fetcher.submit(
        {
          intent: 'update-timetable-position',
          entryId: entry.id,
          day: newDay,
          startTime: newTime,
        },
        { method: 'post' }
      );
    }

    setActiveId(null);
    setDragPreview(null);
  }

  function handleDragMove(event: any) {
    if (event.activatorEvent && 'clientY' in event.activatorEvent) {
      const currentY = event.activatorEvent.clientY + event.delta.y;
      setMouseY(currentY);

      // Calculate preview position
      if (event.over) {
        const overId = event.over.id.toString();
        const day = overId.replace('day-column-', '');
        const dayColumn = dayColumnRefs.current[day];
        
        if (dayColumn) {
          const rect = dayColumn.getBoundingClientRect();
          const relativeY = currentY - rect.top;
          const percentage = Math.max(0, Math.min(100, (relativeY / rect.height) * 100));
          const totalMinutes = TOTAL_HOURS * 60;
          const newMinutes = Math.round((percentage / 100) * totalMinutes);
          const snappedMinutes = Math.round(newMinutes / 5) * 5;
          const newTime = minutesToTime(snappedMinutes);
          
          setDragPreview({ day, time: newTime });
        }
      } else {
        setDragPreview(null);
      }
    }
  }

  // Group entries by day
  const entriesByDay = DAYS.reduce((acc, day) => {
    acc[day.key] = entries.filter((e) => e.day === day.key);
    return acc;
  }, {} as Record<string, TimetableEntry[]>);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6 max-w-7xl mx-auto">
      <h2 className="text-3xl font-bold mb-6">Wochenend-Zeitplan</h2>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
      >
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto"
            style={{ 
              maxHeight: '560px', // Shows ~4 hours (8:00 to 12:00) with doubled height
            }}
          >
          <div
            className="grid gap-4 relative"
            style={{ 
              minHeight: '2400px', // Total height for 21 hours (2:00 to 23:00) - doubled for more zoom
              gridTemplateColumns: 'auto 1fr 1fr 1fr'
            }}
          >
          {/* Time scale column */}
          <div className="relative">
            <div className="h-12 flex items-center justify-center font-bold text-lg border-b">
              Zeit
            </div>
            <div className="relative" style={{ height: 'calc(100% - 48px)' }}>
              {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                const hour = (START_HOUR + i) % 24;
                const percent = (i / TOTAL_HOURS) * 100;
                return (
                  <div
                    key={i}
                    className="absolute left-0 right-0 text-base font-medium text-gray-600 flex items-center"
                    style={{ 
                      top: `${percent}%`,
                      transform: 'translateY(-50%)'
                    }}
                  >
                    <span className="mr-2 whitespace-nowrap">{hour.toString().padStart(2, '0')}:00</span>
                    <div className="flex-1 border-t border-gray-200" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Day columns */}
          {DAYS.map((day) => (
            <DayColumn
              key={day.key}
              day={day}
              entries={entriesByDay[day.key] || []}
              setRef={(ref) => { dayColumnRefs.current[day.key] = ref; }}
              dragPreview={dragPreview?.day === day.key ? dragPreview.time : null}
            />
          ))}
          </div>
          </div>
          {/* Scroll indicator - fade at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>

        <DragOverlay>
          {activeEntry ? <DragOverlayContent entry={activeEntry} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DayColumn({
  day,
  entries,
  setRef,
  dragPreview,
}: {
  day: { key: string; label: string };
  entries: TimetableEntry[];
  setRef: (ref: HTMLDivElement | null) => void;
  dragPreview: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-column-${day.key}`,
  });

  return (
    <div className="relative">
      <div className="h-12 flex items-center justify-center font-bold text-lg border-b bg-blue-50">
        {day.label}
      </div>
      <div
        ref={(node) => {
          setNodeRef(node);
          setRef(node);
        }}
        className={`relative border border-gray-200 rounded transition ${
          isOver ? 'bg-blue-50 border-blue-400' : ''
        }`}
        style={{ height: 'calc(100% - 48px)' }}
      >
        {/* Grid lines for visual guidance */}
        {Array.from({ length: TOTAL_HOURS }, (_, i) => {
          const percent = ((i + 1) / TOTAL_HOURS) * 100;
          return (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-gray-100"
              style={{ top: `${percent}%` }}
            />
          );
        })}

        {/* Drag preview indicator */}
        {dragPreview && (
          <div
            className="absolute left-1 right-1 pointer-events-none"
            style={{
              top: `${getPositionPercent(dragPreview)}%`,
            }}
          >
            <div className="bg-transparent border-2 border-blue-500 border-dashed rounded px-3 py-2 text-base opacity-60 text-gray-800">
              <div className="font-semibold">{dragPreview}</div>
            </div>
          </div>
        )}

        {/* Events */}
        {entries.map((entry) => (
          <DraggableEvent key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function DraggableEvent({ entry }: { entry: TimetableEntry }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
  });

  const topPercent = getPositionPercent(entry.startTime);
  
  // Calculate height based on duration if endTime exists
  let heightPercent: number | undefined;
  if (entry.endTime) {
    const startMinutes = timeToMinutes(entry.startTime);
    const endMinutes = timeToMinutes(entry.endTime);
    const durationMinutes = endMinutes - startMinutes;
    const totalMinutes = TOTAL_HOURS * 60;
    heightPercent = (durationMinutes / totalMinutes) * 100;
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute left-1 right-1"
      style={{
        top: `${topPercent}%`,
        height: heightPercent ? `${heightPercent}%` : 'auto',
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <EventCard entry={entry} />
    </div>
  );
}

function EventCard({
  entry,
  isDragging = false,
}: {
  entry: TimetableEntry;
  isDragging?: boolean;
}) {
  const timeRange = entry.endTime 
    ? `${entry.startTime} - ${entry.endTime}` 
    : entry.startTime;
  
  // Calculate duration in minutes
  let durationMinutes = 60; // default
  if (entry.endTime) {
    const [startHours, startMins] = entry.startTime.split(':').map(Number);
    const [endHours, endMins] = entry.endTime.split(':').map(Number);
    durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
  }
  
  const isSmallEntry = durationMinutes <= 15;
  
  return (
    <div
      className={`
        bg-blue-200/70 border-2 border-blue-500 text-gray-800 rounded px-3 text-base cursor-move
        hover:border-blue-600 hover:bg-blue-300/70 transition shadow h-full flex items-start
        ${isDragging ? 'opacity-80 rotate-2' : ''}
        ${isSmallEntry ? 'py-0' : 'py-2'}
      `}
    >
      <div className="font-semibold text-sm whitespace-nowrap mr-2">{timeRange}</div>
      <div className="text-sm flex-1 overflow-hidden">{entry.content}</div>
    </div>
  );
}

