const userRepository = require('../src/repositories/userRepository');
const cardRepository = require('../src/repositories/cardRepository');
const User = require('../src/models/User');
const Card = require('../src/models/Card');

describe('Repository Layer', () => {
  const createdUserIds = [];
  const createdCardIds = [];

  afterEach(async () => {
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
      createdUserIds.length = 0;
    }

    if (createdCardIds.length > 0) {
      await Card.deleteMany({ _id: { $in: createdCardIds } });
      createdCardIds.length = 0;
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

  it('aggregates card status counts', async () => {
    const uidBase = Date.now().toString(16).toUpperCase().slice(-6).padStart(6, '0');
    const cards = await cardRepository.insertMany([
      { uid: `AA${uidBase}`, type: 'NTAG', status: 'active' },
      { uid: `AB${uidBase}`, type: 'NTAG', status: 'active' },
      { uid: `AC${uidBase}`, type: 'UNKNOWN', status: 'inactive' }
    ]);

    cards.forEach(card => createdCardIds.push(card._id));

    const results = await cardRepository.aggregate([
      { $match: { uid: { $in: cards.map(card => card.uid) } } },
      { $group: { _id: '$status', total: { $sum: 1 } } }
    ]);

    const counts = results.reduce((acc, item) => {
      acc[item._id] = item.total;
      return acc;
    }, {});

    expect(counts.active).toBe(2);
    expect(counts.inactive).toBe(1);
  });
});
