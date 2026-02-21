import type { SessionEvent } from "@shared/schema";
import EmptyState from "./EmptyState";
import EventItem from "./EventItem";

interface EventTimelineProps {
  events: SessionEvent[];
}

const EventTimeline = ({ events }: EventTimelineProps) => {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No events"
        description="This session has no normalized events yet. Try rescanning if this looks wrong."
      />
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <EventItem key={event.id} event={event} />
      ))}
    </ol>
  );
};

export default EventTimeline;
