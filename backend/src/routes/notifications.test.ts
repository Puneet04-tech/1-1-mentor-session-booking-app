jest.mock('@/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import notificationsRouter, { createNotification } from './notifications';

interface RegisteredRoute {
  path: string;
  methods: string[];
}

/** Collect the routes registered on an Express router from its layer stack. */
function collectRoutes(router: any): RegisteredRoute[] {
  return (router.stack || [])
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
    }));
}

describe('notifications router — spoofing endpoint removed (issue #142)', () => {
  const routes = collectRoutes(notificationsRouter);

  it('does NOT expose a client-callable POST / notification-creation route', () => {
    const genericPost = routes.find(
      (r) => r.path === '/' && r.methods.includes('post')
    );
    expect(genericPost).toBeUndefined();
  });

  it('exposes no POST routes at all (notifications are server-generated only)', () => {
    const postRoutes = routes.filter((r) => r.methods.includes('post'));
    expect(postRoutes).toHaveLength(0);
  });

  it('still exposes the legitimate read/mutate routes scoped to the caller', () => {
    const paths = routes.map((r) => `${r.methods.join('|')} ${r.path}`);
    expect(paths).toContain('get /');
    expect(paths).toContain('put /mark-all/read');
    expect(paths).toContain('delete /:notification_id');
  });

  it('keeps the internal createNotification() available for server-side handlers', () => {
    expect(typeof createNotification).toBe('function');
  });
});
