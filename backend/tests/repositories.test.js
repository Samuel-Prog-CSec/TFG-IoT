const userRepository = require('../src/repositories/userRepository');
const User = require('../src/models/User');

describe('Repository Layer — Read Operations', () => {
  let testUser;
  const uniqueSuffix = Date.now().toString(36);
  const testEmail = `repo-test-${uniqueSuffix}@test.com`;

  beforeAll(async () => {
    testUser = await userRepository.create({
      name: 'Repo Test Teacher',
      email: testEmail,
      password: 'Password123',
      role: 'teacher',
      status: 'active'
    });
  });

  afterAll(async () => {
    await User.deleteMany({ _id: testUser._id });
  });

  it('creates a document and returns it with an _id', () => {
    expect(testUser).not.toBeNull();
    expect(testUser._id).toBeDefined();
    expect(testUser.email).toBe(testEmail);
  });

  it('findOne applies select projection to exclude fields', async () => {
    const found = await userRepository.findOne({ email: testEmail }, { select: 'email name role' });

    expect(found).not.toBeNull();
    expect(found.email).toBe(testEmail);
    expect(found.name).toBe('Repo Test Teacher');
    expect(found.role).toBe('teacher');
    expect(found.password).toBeUndefined();
  });

  it('count returns the number of matching documents', async () => {
    const teachersCount = await userRepository.count({ role: 'teacher' });

    expect(teachersCount).toBeGreaterThanOrEqual(1);
  });

  it('find with sort and limit returns the expected subset', async () => {
    const results = await userRepository.find(
      { role: 'teacher' },
      { select: 'email role', sort: { createdAt: -1 }, limit: 1 }
    );

    expect(results).toHaveLength(1);
    expect(results[0].email).toBe(testEmail);
  });

  it('findOne returns null when no document matches', async () => {
    const found = await userRepository.findOne({ email: 'nonexistent@test.com' });

    expect(found).toBeNull();
  });
});
