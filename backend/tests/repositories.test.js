const userRepository = require('../src/repositories/userRepository');
const User = require('../src/models/User');

describe('Repository Layer', () => {
  const createdUserIds = [];

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
      createdUserIds.length = 0;
    }
  });

  it('creates and queries users with query options', async () => {
    const uniqueSuffix = Date.now().toString(36);
    const email = `repo-test-${uniqueSuffix}@test.com`;

    const createdUser = await userRepository.create({
      name: 'Repo Test Teacher',
      email,
      password: 'Password123',
      role: 'teacher',
      status: 'active'
    });

    createdUserIds.push(createdUser._id);

    const foundUser = await userRepository.findOne(
      { email },
      { select: 'email name role', sort: { createdAt: -1 } }
    );

    expect(foundUser).not.toBeNull();
    expect(foundUser.email).toBe(email);
    expect(foundUser.name).toBe('Repo Test Teacher');
    expect(foundUser.role).toBe('teacher');
    expect(foundUser.password).toBeUndefined();

    const teachersCount = await userRepository.count({ role: 'teacher' });
    expect(teachersCount).toBeGreaterThanOrEqual(1);

    const latestTeachers = await userRepository.find(
      { role: 'teacher' },
      { select: 'email role', sort: { createdAt: -1 }, limit: 1 }
    );

    expect(latestTeachers.length).toBe(1);
    expect(latestTeachers[0].email).toBe(email);
  });
});
