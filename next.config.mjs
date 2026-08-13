/** @type {import('next').NextConfig} */
export default {
  // @libsql/client ships native bindings — keep it out of the bundler and let
  // Node require it directly at runtime.
  serverExternalPackages: ['@libsql/client'],
};
