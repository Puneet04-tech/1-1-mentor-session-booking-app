'use client';

import { GlowingCard, Badge, GradientText } from '@/components/ui/GlowingComponents';

const announcements = [
  {
    title: 'Platform Maintenance',
    description: 'The platform will undergo scheduled maintenance this Saturday from 2:00 AM to 4:00 AM UTC.',
    category: 'Notice',
  },
];

const events = [
  {
    date: '2026-07-05',
    title: 'React Mentorship Webinar',
    description: 'Join senior mentors for an interactive React Q&A session.',
    category: 'Webinar',
  },
  {
    date: '2026-07-12',
    title: 'Career Guidance Session',
    description: 'Learn resume building and interview preparation from industry experts.',
    category: 'Event',
  },
  {
    date: '2026-06-20',
    title: 'June Community Meetup',
    description: 'Networking session for mentors and learners.',
    category: 'Archived',
  },
];

export default function EventsAnnouncements() {
  const today = new Date();

  const upcoming = events.filter(
    (event) => new Date(event.date) >= today
  );

  const archived = events.filter(
    (event) => new Date(event.date) < today
  );

  return (
    <section className="max-w-6xl mx-auto py-16 px-6 space-y-10">

      <div className="text-center">
        <GradientText className="text-4xl font-bold">
          Events & Announcements
        </GradientText>
        <p className="mt-3 text-gray-600 dark:text-gray-400">
          Stay updated with the latest mentor events, webinars and platform announcements.
        </p>
      </div>

      <GlowingCard glow="yellow" className="p-6">
        <h2 className="text-xl font-bold mb-4">
          📢 Important Announcement
        </h2>

        {announcements.map((item) => (
          <div key={item.title}>
            <Badge color="red">{item.category}</Badge>

            <h3 className="mt-3 text-lg font-semibold">
              {item.title}
            </h3>

            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {item.description}
            </p>
          </div>
        ))}
      </GlowingCard>

      <div>
        <h2 className="text-2xl font-bold mb-5">
          Upcoming Events
        </h2>

        <div className="grid md:grid-cols-2 gap-5">
          {upcoming.map((event) => (
            <GlowingCard
              key={event.title}
              glow="purple"
              className="p-5"
            >
              <Badge color="green">{event.category}</Badge>

              <p className="text-sm text-gray-500 mt-3">
                {event.date}
              </p>

              <h3 className="font-bold text-lg mt-1">
                {event.title}
              </h3>

              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {event.description}
              </p>
            </GlowingCard>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-5">
          Archived Events
        </h2>

        <div className="grid md:grid-cols-2 gap-5">
          {archived.map((event) => (
            <GlowingCard
              key={event.title}
              glow="blue"
              className="p-5 opacity-80"
            >
              <Badge color="purple">{event.category}</Badge>

              <p className="text-sm text-gray-500 mt-3">
                {event.date}
              </p>

              <h3 className="font-bold text-lg mt-1">
                {event.title}
              </h3>

              <p className="text-gray-600 dark:text-gray-400 mt-2">
                {event.description}
              </p>
            </GlowingCard>
          ))}
        </div>
      </div>

    </section>
  );
}
