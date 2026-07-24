module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  maxWorkers: 1,
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@reclaimai/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@reclaimai/shared-auth$': '<rootDir>/../../libs/shared-auth/src/index.ts',
  },
};
