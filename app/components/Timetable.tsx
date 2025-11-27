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

// Get the date for a weekend day key based on the current week
function getDateForDay(dayKey: string): string {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
  
  let targetDate = new Date(now);
  
  // Calculate days until next occurrence
  if (dayKey === 'friday') {
    const daysUntilFriday = currentDay <= 5 ? 5 - currentDay : 7 - (currentDay - 5);
    targetDate.setDate(now.getDate() + daysUntilFriday);
  } else if (dayKey === 'saturday') {
    const daysUntilSaturday = currentDay <= 6 ? 6 - currentDay : 7 - (currentDay - 6);
    targetDate.setDate(now.getDate() + daysUntilSaturday);
  } else if (dayKey === 'sunday') {
    const daysUntilSunday = currentDay === 0 ? 0 : 7 - currentDay;
    targetDate.setDate(now.getDate() + daysUntilSunday);
  }
  
  return targetDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const DAYS = [
  { key: 'friday', label: 'Freitag', date: getDateForDay('friday') },
  { key: 'saturday', label: 'Samstag', date: getDateForDay('saturday') },
  { key: 'sunday', label: 'Sonntag', date: getDateForDay('sunday') },
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
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fetcher = useFetcher();
  const dayColumnRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Fade-in animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

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
      
      // Show success feedback
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
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

  const handleUpdateEntry = (entryId: string, day: string, startTime: string, endTime: string) => {
    fetcher.submit(
      {
        intent: 'update-timetable-position',
        entryId,
        day,
        startTime,
        endTime,
      },
      { method: 'post' }
    );
  };

  return (
    <div 
      className={`
        bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-2 sm:p-6 mb-6 mx-auto
        transition-all duration-500 ease-out
        ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      role="region"
      aria-label="Wochenend-Zeitplan"
    >
      <div className="flex items-center justify-between mb-4 sm:mb-6 px-2">
        <h2 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">
          Wochenend-Zeitplan
        </h2>
        {showSuccess && (
          <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 px-3 py-1 rounded-full text-sm font-medium animate-in fade-in slide-in-from-right-5 duration-300">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Gespeichert
          </div>
        )}
      </div>

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
              {DAYS.map((day, index) => (
                <DaySection
                  key={day.key}
                  day={day}
                  entries={entriesByDay[day.key] || []}
                  setRef={(ref) => { dayColumnRefs.current[day.key] = ref; }}
                  dayIndex={index}
                  onUpdateEntry={handleUpdateEntry}
                />
              ))}
            </div>
          </div>
          {/* Scroll indicator - fade at bottom with dark mode support */}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white dark:from-gray-900 to-transparent pointer-events-none" />
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
  dayIndex,
  onUpdateEntry,
}: {
  day: { key: string; label: string; date: string };
  entries: TimetableEntry[];
  setRef: (ref: HTMLDivElement | null) => void;
  dayIndex: number;
  onUpdateEntry: (entryId: string, day: string, startTime: string, endTime: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-section-${day.key}`,
  });

  // Check if this is the current day
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const isCurrentDay = 
    (day.key === 'friday' && currentDayOfWeek === 5) ||
    (day.key === 'saturday' && currentDayOfWeek === 6) ||
    (day.key === 'sunday' && currentDayOfWeek === 0);

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
  const heightPerHour = 120; // pixels per hour (keep consistent)
  const timelineHeight = dayHours * heightPerHour;
  const dayHeight = timelineHeight + 16; // Add 16px top padding

  // Calculate current time position if it's the current day
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  let currentTimePercent: number | null = null;
  if (isCurrentDay && currentHour >= dayStartHour && currentHour < dayEndHour) {
    const minutesFromDayStart = (currentHour - dayStartHour) * 60 + currentMinute;
    const totalDayMinutes = dayHours * 60;
    currentTimePercent = (minutesFromDayStart / totalDayMinutes) * 100;
  }

  // Staggered animation delay based on day index
  const animationDelay = dayIndex * 100;

  return (
    <div 
      className="mb-6 sm:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Day header with gradient and date */}
      <div 
        className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-500 dark:to-indigo-500 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-t-lg shadow-lg"
        role="heading"
        aria-level={3}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg sm:text-xl font-bold">{day.label}</h3>
          <span className="text-sm sm:text-base opacity-90 font-medium">{day.date}</span>
        </div>
        {isCurrentDay && (
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            <span className="text-xs sm:text-sm opacity-90">Heute</span>
          </div>
        )}
      </div>
      
      {/* Timeline container */}
      <div
        ref={(node) => {
          setNodeRef(node);
          setRef(node);
        }}
        className={`
          relative border-l-2 border-r-2 border-b-2 rounded-b-lg
          transition-all duration-300 ease-in-out
          ${isOver 
            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-500 shadow-lg' 
            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700'
          }
        `}
        style={{ 
          minHeight: `${dayHeight}px`,
        }}
        data-day-start={dayStartHour}
        data-day-hours={dayHours}
        role="group"
        aria-label={`${day.label} Zeitplan`}
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
                  <span className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-1 sm:px-2 py-0.5 -mt-2 sticky left-0 rounded">
                    {hour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                {/* Horizontal grid line */}
                <div className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700" style={{ top: '0' }} />
              </div>
            );
          })}
        </div>

        {/* Current time indicator */}
        {currentTimePercent !== null && (
          <div 
            className="absolute left-0 right-0 z-20 pointer-events-none"
            style={{ 
              top: `calc(16px + ${currentTimePercent}%)`,
            }}
          >
            <div className="relative">
              {/* Pulsing dot */}
              <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-lg"></div>
              {/* Line */}
              <div className="h-0.5 bg-gradient-to-r from-red-500 to-orange-500 shadow-md"></div>
              {/* Current time label */}
              <div className="absolute left-12 -top-3 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded shadow-lg">
                {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        )}

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
              onUpdateEntry={onUpdateEntry}
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
  onUpdateEntry,
}: { 
  entry: TimetableEntry;
  dayStartHour: number;
  dayHours: number;
  allEntries: TimetableEntry[];
  containerTopPadding: number;
  onUpdateEntry?: (entryId: string, day: string, startTime: string, endTime: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: entry.id,
  });

  const [isResizing, setIsResizing] = useState(false);
  const [resizeEndTime, setResizeEndTime] = useState<string | null>(null);
  const currentResizeEndTimeRef = useRef<string | null>(null);

  // Handle resizing interaction
  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    
    if (!onUpdateEntry) return;
    
    const startY = e.clientY;
    const [startH, startM] = entry.startTime.split(':').map(Number);
    const startMinutesTotal = startH * 60 + startM;
    
    // Determine initial end time
    let initialEndMinutes = startMinutesTotal + 30; // Default duration 30m
    if (entry.endTime) {
      const [endH, endM] = entry.endTime.split(':').map(Number);
      initialEndMinutes = endH * 60 + endM;
    }
    
    setIsResizing(true);
    currentResizeEndTimeRef.current = entry.endTime; // Initialize with current
    
    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // 120px per hour = 2px per minute
      const deltaMinutes = Math.round(deltaY / 2);
      
      // Snap to 5 minute intervals
      const snappedDeltaMinutes = Math.round(deltaMinutes / 5) * 5;
      
      let newEndMinutes = initialEndMinutes + snappedDeltaMinutes;
      
      // Minimum duration 15 minutes
      if (newEndMinutes < startMinutesTotal + 15) {
        newEndMinutes = startMinutesTotal + 15;
      }
      
      // Update local visual state
      const endH = Math.floor(newEndMinutes / 60) % 24;
      const endM = newEndMinutes % 60;
      const newEndTimeStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      
      setResizeEndTime(newEndTimeStr);
      currentResizeEndTimeRef.current = newEndTimeStr;
    };
    
    const onPointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      
      // Commit changes using the ref value
      const finalEndTime = currentResizeEndTimeRef.current;
      if (finalEndTime && finalEndTime !== entry.endTime) {
        onUpdateEntry(entry.id, entry.day, entry.startTime, finalEndTime);
      }
      setResizeEndTime(null);
      currentResizeEndTimeRef.current = null;
    };
    
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Use resizeEndTime if resizing, otherwise entry.endTime
  const effectiveEndTime = isResizing ? resizeEndTime : entry.endTime;

  // Calculate position based on day-specific timeline
  const [hours, minutes] = entry.startTime.split(':').map(Number);
  const startMinutesFromDayStart = (hours - dayStartHour) * 60 + minutes;
  const totalDayMinutes = dayHours * 60;
  // The container now has top padding already applied via positioning, so use full percentage
  const topPercent = (startMinutesFromDayStart / totalDayMinutes) * 100;
  
  // Calculate height based on duration if effectiveEndTime exists
  let heightPercent: number | undefined;
  let durationMinutes = 30; // default
  let minHeightPx: number | undefined;
  const MIN_ENTRY_HEIGHT = 52; // Minimum height in pixels
  
  if (effectiveEndTime) {
    const [startHours, startMins] = entry.startTime.split(':').map(Number);
    const [endHours, endMins] = effectiveEndTime.split(':').map(Number);
    durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
    heightPercent = (durationMinutes / totalDayMinutes) * 100;
    
    // Calculate actual pixel height based on the percentage
    const calculatedHeightPx = (heightPercent / 100) * (dayHours * 120); // 120px per hour
    
    // If calculated height is less than minimum, use minimum height instead
    if (calculatedHeightPx < MIN_ENTRY_HEIGHT) {
      minHeightPx = MIN_ENTRY_HEIGHT;
    }
  }

  // Check for overlapping events and calculate column position
  // We need to consider VISUAL overlap (due to min-height), not just time overlap
  const PIXELS_PER_MINUTE = 2; // 120px per hour / 60 minutes
  const VISUAL_MIN_DURATION = MIN_ENTRY_HEIGHT / PIXELS_PER_MINUTE; // 26 minutes

  const getVisualRange = (e: TimetableEntry, overrideEndTime?: string | null) => {
    const [h, m] = e.startTime.split(':').map(Number);
    const start = h * 60 + m;
    let end = start + 30; // default
    const endTime = overrideEndTime !== undefined ? overrideEndTime : e.endTime;
    
    if (endTime) {
      const [endH, endM] = endTime.split(':').map(Number);
      const actualEnd = endH * 60 + endM;
      const actualDuration = actualEnd - start;
      // The end time is visually extended if the duration is shorter than the minimum visual height
      end = start + Math.max(actualDuration, VISUAL_MIN_DURATION);
    }
    return { start, end };
  };

  const { start: entryStart, end: entryVisualEnd } = getVisualRange(entry, effectiveEndTime);

  // Find overlapping events using visual ranges
  const overlappingEvents = allEntries.filter(other => {
    if (other.id === entry.id) return false;
    
    const { start: otherStart, end: otherVisualEnd } = getVisualRange(other);
    
    // Check if VISUAL ranges overlap
    return (entryStart < otherVisualEnd && entryVisualEnd > otherStart);
  });

  // Calculate column index (simple approach: earlier events get left columns)
  const columnIndex = overlappingEvents.filter(other => {
    const [otherStartH, otherStartM] = other.startTime.split(':').map(Number);
    const otherStartMinutes = otherStartH * 60 + otherStartM;
    return otherStartMinutes < entryStart || 
           (otherStartMinutes === entryStart && other.id < entry.id);
  }).length;

  const totalColumns = overlappingEvents.length + 1;
  const columnWidth = totalColumns > 1 ? `${100 / totalColumns}%` : 'calc(100% - 8px)';
  const leftOffset = totalColumns > 1 ? `${(columnIndex / totalColumns) * 100}%` : '4px';

  // Construct a temporary entry object for the card if resizing
  const displayEntry = isResizing ? { ...entry, endTime: effectiveEndTime } : entry;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`absolute transition-opacity duration-200 ${isResizing ? 'z-50' : ''}`}
      style={{
        top: `${topPercent}%`,
        left: leftOffset,
        width: columnWidth,
        height: minHeightPx ? `${minHeightPx}px` : heightPercent ? `${heightPercent}%` : 'auto',
        opacity: isDragging ? 0 : 1,
        paddingRight: totalColumns > 1 ? '4px' : '0',
      }}
      role="button"
      tabIndex={0}
      aria-label={`Ereignis: ${displayEntry.content}, Zeit: ${displayEntry.startTime}${displayEntry.endTime ? ` bis ${displayEntry.endTime}` : ''}`}
    >
      <EventCard 
        entry={displayEntry} 
        onResizeStart={onUpdateEntry ? handleResizeStart : undefined}
        isNarrow={totalColumns > 1}
      />
    </div>
  );
}

function DragOverlayContent({ entry }: { entry: TimetableEntry }) {
  const MIN_ENTRY_HEIGHT = 52;
  
  // Calculate height based on duration if endTime exists
  let heightPixels: number | string = 'auto';
  if (entry.endTime) {
    const [startHours, startMins] = entry.startTime.split(':').map(Number);
    const [endHours, endMins] = entry.endTime.split(':').map(Number);
    const durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
    
    // Use consistent 120px per hour, with minimum height
    const calculatedHeight = (durationMinutes / 60) * 120;
    heightPixels = Math.max(MIN_ENTRY_HEIGHT, calculatedHeight);
  }

  return (
    <div
      className="animate-in zoom-in-95 duration-200"
      style={{
        height: heightPixels,
        width: 'calc(100vw - 100px)',
        maxWidth: '420px',
      }}
    >
      <EventCard entry={entry} isDragging />
    </div>
  );
}

function EventCard({
  entry,
  isDragging = false,
  onResizeStart,
  isNarrow = false,
}: {
  entry: TimetableEntry;
  isDragging?: boolean;
  onResizeStart?: (e: React.PointerEvent) => void;
  isNarrow?: boolean;
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
  
  const isSmallEntry = durationMinutes <= 45;
  
  // Duration indicator icon
  const getDurationIcon = () => {
    if (durationMinutes <= 30) return '⚡'; // Quick
    if (durationMinutes <= 90) return '⏱️'; // Medium
    return '⏰'; // Long
  };
  
  return (
    <div
      className={`
        relative overflow-hidden group
        bg-gradient-to-br from-blue-400 to-purple-500 dark:from-blue-500 dark:to-purple-600
        border-2 border-blue-300 dark:border-blue-400
        text-white rounded-lg cursor-move
        shadow-lg hover:shadow-xl
        transition-all duration-300 ease-out
        hover:scale-[1.02] hover:border-blue-200 dark:hover:border-blue-300
        focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900
        ${isDragging ? 'opacity-90 scale-105 shadow-2xl' : ''}
        ${isSmallEntry ? 'py-1 px-2 min-h-[48px]' : 'py-2.5 px-3 sm:px-4 min-h-[48px]'}
      `}
      style={{ touchAction: 'none', height: 'calc(100% - 4px)', marginBottom: '4px' }}
    >
      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
      
      {/* Content - compact horizontal layout for small entries */}
      {isSmallEntry ? (
        // Compact horizontal layout for small entries (≤45 minutes)
        <div className="relative z-10 flex items-center justify-between gap-1.5 h-full">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {/* In narrow mode, hide time range to prioritize content, or show only start time */}
            {!isNarrow && (
              <div className="font-bold text-xs whitespace-nowrap text-blue-50 flex-shrink-0">
                {timeRange}
              </div>
            )}
            {isNarrow && (
              <div className="font-bold text-[10px] whitespace-nowrap text-blue-50 flex-shrink-0">
                {entry.startTime}
              </div>
            )}
            <div className="text-xs font-medium truncate leading-tight">
              {entry.content}
            </div>
          </div>
          {/* Hide icon in narrow mode to save space */}
          {!isNarrow && (
            <span className="text-base flex-shrink-0" role="img" aria-label={`Dauer: ${durationMinutes} Minuten`}>
              {getDurationIcon()}
            </span>
          )}
        </div>
      ) : (
        // Standard vertical layout for normal entries
        <div className="relative z-10 flex flex-col h-full justify-center pb-3">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className={`font-bold ${isNarrow ? 'text-xs' : 'text-xs sm:text-sm'} text-blue-50 whitespace-nowrap`}>
              {isNarrow ? entry.startTime : timeRange}
            </div>
            {!isNarrow && (
              <span className="text-base sm:text-lg flex-shrink-0" role="img" aria-label={`Dauer: ${durationMinutes} Minuten`}>
                {getDurationIcon()}
              </span>
            )}
          </div>
          <div className="text-xs sm:text-sm flex-1 overflow-hidden font-medium leading-snug line-clamp-3">
            {entry.content}
          </div>
        </div>
      )}
      
      {/* Bottom shine effect */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>

      {/* Resize Handle */}
      {!isDragging && onResizeStart && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-3 cursor-ns-resize flex items-center justify-center hover:bg-white/10 transition-colors z-20"
          onPointerDown={onResizeStart}
        >
          <div className="w-8 h-1 bg-white/30 rounded-full"></div>
        </div>
      )}
    </div>
  );
}

