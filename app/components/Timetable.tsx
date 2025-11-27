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

  // Auto-scroll to current day and time
  useEffect(() => {
    // Use a small delay to ensure DOM is fully rendered
    const timer = setTimeout(() => {
      if (!scrollContainerRef.current) return;
      
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
      const currentHour = now.getHours();
      
      // Determine which day to scroll to
      let targetDayKey = 'friday';
      if (dayOfWeek === 6) {
        targetDayKey = 'saturday';
      } else if (dayOfWeek === 0) {
        targetDayKey = 'sunday';
      } else if (dayOfWeek === 5) {
        targetDayKey = 'friday';
      }
      
      // Find the target day section
      const targetDaySection = dayColumnRefs.current[targetDayKey];
      if (targetDaySection) {
        const container = scrollContainerRef.current;
        
        // Get the position relative to the scroll container
        const containerRect = container.getBoundingClientRect();
        const sectionRect = targetDaySection.getBoundingClientRect();
        const sectionTop = sectionRect.top - containerRect.top + container.scrollTop;
        
        // Get day-specific info
        const dayStartHour = parseInt(targetDaySection.getAttribute('data-day-start') || String(START_HOUR));
        const dayHours = parseInt(targetDaySection.getAttribute('data-day-hours') || String(TOTAL_HOURS));
        
        // Calculate time offset within the day
        let timeOffset = 0;
        if (dayOfWeek >= 5 || dayOfWeek === 0) {
          // We're in the weekend, scroll to current time
          if (currentHour >= dayStartHour && currentHour <= dayStartHour + dayHours) {
            const minutesFromDayStart = (currentHour - dayStartHour) * 60;
            const totalDayMinutes = dayHours * 60;
            const dayHeight = targetDaySection.offsetHeight;
            timeOffset = (minutesFromDayStart / totalDayMinutes) * dayHeight;
          }
        }
        
        // Scroll to position (subtract some offset to center it better in viewport)
        const scrollPosition = sectionTop + timeOffset - 100;
        container.scrollTop = Math.max(0, scrollPosition);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  const activeEntry = activeId
    ? entries.find((e) => e.id === activeId)
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
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

    // Extract day from the droppable id (format: "day-section-{day}")
    const overId = over.id.toString();
    const newDay = overId.replace('day-section-', '');

    // Calculate new time based on Y position within the day section
    const daySection = dayColumnRefs.current[newDay];
    if (!daySection) {
      setActiveId(null);
      return;
    }

    // Get day-specific time range from data attributes
    const dayStartHour = parseInt(daySection.getAttribute('data-day-start') || String(START_HOUR));
    const dayHours = parseInt(daySection.getAttribute('data-day-hours') || String(TOTAL_HOURS));

    const rect = daySection.getBoundingClientRect();
    const topPadding = 16; // Same as the container padding
    const relativeY = mouseY - rect.top - topPadding; // Subtract the padding from the top
    const effectiveHeight = rect.height - topPadding; // Height without padding
    const percentage = Math.max(0, Math.min(100, (relativeY / effectiveHeight) * 100));
    const totalDayMinutes = dayHours * 60;
    const minutesFromDayStart = Math.round((percentage / 100) * totalDayMinutes);
    // Snap to 5-minute intervals
    const snappedMinutes = Math.round(minutesFromDayStart / 5) * 5;
    
    // Convert to actual time
    const totalMinutes = dayStartHour * 60 + snappedMinutes;
    const hours = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    const newStartTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;

    // Calculate new end time by maintaining the duration
    let newEndTime: string | null = null;
    if (entry.endTime) {
      const [oldStartHours, oldStartMins] = entry.startTime.split(':').map(Number);
      const [oldEndHours, oldEndMins] = entry.endTime.split(':').map(Number);
      const durationMinutes = (oldEndHours * 60 + oldEndMins) - (oldStartHours * 60 + oldStartMins);
      const newEndTotalMinutes = totalMinutes + durationMinutes;
      const endHours = Math.floor(newEndTotalMinutes / 60) % 24;
      const endMins = newEndTotalMinutes % 60;
      newEndTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    }

    // Only update if something changed
    if (newDay !== entry.day || newStartTime !== entry.startTime) {
      fetcher.submit(
        {
          intent: 'update-timetable-position',
          entryId: entry.id,
          day: newDay,
          startTime: newStartTime,
          endTime: newEndTime || '',
        },
        { method: 'post' }
      );
    }

    setActiveId(null);
  }

  function handleDragMove(event: any) {
    if (event.activatorEvent && 'clientY' in event.activatorEvent) {
      const currentY = event.activatorEvent.clientY + event.delta.y;
      setMouseY(currentY);
    }
  }

  // Group entries by day
  const entriesByDay = DAYS.reduce((acc, day) => {
    acc[day.key] = entries.filter((e) => e.day === day.key);
    return acc;
  }, {} as Record<string, TimetableEntry[]>);

  return (
    <div className="bg-white rounded-lg shadow-lg p-2 sm:p-6 mb-6 mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 px-2">Wochenend-Zeitplan</h2>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragMove={handleDragMove}
      >
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto scroll-smooth"
            style={{ 
              maxHeight: 'calc(100vh - 200px)',
              WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            }}
          >
            <div className="relative">
              {/* Vertically stacked day sections */}
              {DAYS.map((day) => (
                <DaySection
                  key={day.key}
                  day={day}
                  entries={entriesByDay[day.key] || []}
                  setRef={(ref) => { dayColumnRefs.current[day.key] = ref; }}
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

function DaySection({
  day,
  entries,
  setRef,
}: {
  day: { key: string; label: string };
  entries: TimetableEntry[];
  setRef: (ref: HTMLDivElement | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-section-${day.key}`,
  });

  // Calculate the time range for this day based on entries
  let dayStartHour = DEFAULT_VISIBLE_START_HOUR; // Default to 8:00
  let dayEndHour = 20; // Default to 20:00
  
  if (entries.length > 0) {
    // Find earliest and latest times
    const times = entries.flatMap(e => {
      const times = [e.startTime];
      if (e.endTime) times.push(e.endTime);
      return times;
    });
    
    const hourMinutes = times.map(t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    });
    
    const earliestMinutes = Math.min(...hourMinutes);
    const latestMinutes = Math.max(...hourMinutes);
    
    // Round down to nearest hour for start, up for end, with 1 hour padding
    dayStartHour = Math.max(START_HOUR, Math.floor(earliestMinutes / 60) - 1);
    dayEndHour = Math.min(END_HOUR, Math.ceil(latestMinutes / 60) + 1);
  }
  
  const dayHours = dayEndHour - dayStartHour;
  const heightPerHour = 120; // pixels per hour
  const timelineHeight = dayHours * heightPerHour;
  const dayHeight = timelineHeight + 16; // Add 16px top padding

  return (
    <div className="mb-6 sm:mb-8">
      {/* Day header */}
      <div className="sticky top-0 z-20 bg-blue-500 text-white px-3 py-2 sm:py-3 rounded-t-lg shadow-md">
        <h3 className="text-lg sm:text-xl font-bold">{day.label}</h3>
      </div>
      
      {/* Timeline container */}
      <div
        ref={(node) => {
          setNodeRef(node);
          setRef(node);
        }}
        className={`relative border-l-2 border-r-2 border-b-2 border-gray-300 rounded-b-lg transition ${
          isOver ? 'bg-blue-50 border-blue-400' : 'bg-white'
        }`}
        style={{ 
          minHeight: `${dayHeight}px`,
        }}
        data-day-start={dayStartHour}
        data-day-hours={dayHours}
      >
        {/* Time labels and grid lines */}
        <div className="absolute pointer-events-none z-0" style={{ top: '16px', left: '0', right: '0', bottom: '0' }}>
          {Array.from({ length: dayHours + 1 }, (_, i) => {
            const hour = (dayStartHour + i) % 24;
            const percent = (i / dayHours) * 100;
            return (
              <div
                key={i}
                className="absolute left-0 right-0"
                style={{ 
                  top: `${percent}%`,
                }}
              >
                {/* Time label */}
                <div className="flex items-start pointer-events-auto">
                  <span className="text-xs sm:text-sm font-medium text-gray-600 bg-white px-1 sm:px-2 py-0.5 -mt-2 sticky left-0">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                {/* Horizontal grid line */}
                <div className="absolute left-0 right-0 border-t border-gray-200" style={{ top: '0' }} />
              </div>
            );
          })}
        </div>

        {/* Events */}
        <div className="absolute z-10" style={{ top: '16px', left: '50px', right: '8px', bottom: '0' }}>
          {entries.map((entry, index) => (
            <DraggableEvent 
              key={entry.id} 
              entry={entry} 
              dayStartHour={dayStartHour} 
              dayHours={dayHours}
              allEntries={entries}
              containerTopPadding={16}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DraggableEvent({ 
  entry, 
  dayStartHour, 
  dayHours,
  allEntries,
  containerTopPadding,
}: { 
  entry: TimetableEntry;
  dayStartHour: number;
  dayHours: number;
  allEntries: TimetableEntry[];
  containerTopPadding: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
  });

  // Calculate position based on day-specific timeline
  const [hours, minutes] = entry.startTime.split(':').map(Number);
  const startMinutesFromDayStart = (hours - dayStartHour) * 60 + minutes;
  const totalDayMinutes = dayHours * 60;
  // The container now has top padding already applied via positioning, so use full percentage
  const topPercent = (startMinutesFromDayStart / totalDayMinutes) * 100;
  
  // Calculate height based on duration if endTime exists
  let heightPercent: number | undefined;
  let durationMinutes = 30; // default
  if (entry.endTime) {
    const [startHours, startMins] = entry.startTime.split(':').map(Number);
    const [endHours, endMins] = entry.endTime.split(':').map(Number);
    durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
    heightPercent = (durationMinutes / totalDayMinutes) * 100;
  }

  // Check for overlapping events and calculate column position
  const [entryStartH, entryStartM] = entry.startTime.split(':').map(Number);
  const entryStartMinutes = entryStartH * 60 + entryStartM;
  const entryEndMinutes = entry.endTime 
    ? parseInt(entry.endTime.split(':')[0]) * 60 + parseInt(entry.endTime.split(':')[1])
    : entryStartMinutes + 30;

  // Find overlapping events
  const overlappingEvents = allEntries.filter(other => {
    if (other.id === entry.id) return false;
    
    const [otherStartH, otherStartM] = other.startTime.split(':').map(Number);
    const otherStartMinutes = otherStartH * 60 + otherStartM;
    const otherEndMinutes = other.endTime
      ? parseInt(other.endTime.split(':')[0]) * 60 + parseInt(other.endTime.split(':')[1])
      : otherStartMinutes + 30;
    
    // Check if time ranges overlap
    return (entryStartMinutes < otherEndMinutes && entryEndMinutes > otherStartMinutes);
  });

  // Calculate column index (simple approach: earlier events get left columns)
  const columnIndex = overlappingEvents.filter(other => {
    const [otherStartH, otherStartM] = other.startTime.split(':').map(Number);
    const otherStartMinutes = otherStartH * 60 + otherStartM;
    return otherStartMinutes < entryStartMinutes || 
           (otherStartMinutes === entryStartMinutes && other.id < entry.id);
  }).length;

  const totalColumns = overlappingEvents.length + 1;
  const columnWidth = totalColumns > 1 ? `${100 / totalColumns}%` : 'calc(100% - 8px)';
  const leftOffset = totalColumns > 1 ? `${(columnIndex / totalColumns) * 100}%` : '4px';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="absolute"
      style={{
        top: `${topPercent}%`,
        left: leftOffset,
        width: columnWidth,
        height: heightPercent ? `${heightPercent}%` : 'auto',
        opacity: isDragging ? 0 : 1,
        paddingRight: totalColumns > 1 ? '4px' : '0',
      }}
    >
      <EventCard entry={entry} />
    </div>
  );
}

function DragOverlayContent({ entry }: { entry: TimetableEntry }) {
  // Calculate height based on duration if endTime exists
  let heightPixels: number | string = 'auto';
  if (entry.endTime) {
    const [startHours, startMins] = entry.startTime.split(':').map(Number);
    const [endHours, endMins] = entry.endTime.split(':').map(Number);
    const durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
    // Use 120px per hour (same as in DaySection)
    heightPixels = (durationMinutes / 60) * 120;
  }

  return (
    <div
      style={{
        height: heightPixels,
        width: 'calc(100vw - 100px)',
        maxWidth: '400px',
      }}
    >
      <EventCard entry={entry} isDragging />
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
        bg-blue-200/70 border-2 border-blue-500 text-gray-800 rounded px-2 sm:px-3 text-sm sm:text-base cursor-move
        hover:border-blue-600 hover:bg-blue-300/70 transition shadow flex flex-col sm:flex-row sm:items-start
        ${isDragging ? 'opacity-80' : ''}
        ${isSmallEntry ? 'py-1 min-h-[44px]' : 'py-2 min-h-[44px]'}
      `}
      style={{ touchAction: 'none', height: 'calc(100% - 4px)', marginBottom: '4px' }}
    >
      <div className="font-semibold text-xs sm:text-sm whitespace-nowrap sm:mr-2">{timeRange}</div>
      <div className="text-xs sm:text-sm flex-1 overflow-hidden line-clamp-3">{entry.content}</div>
    </div>
  );
}

