/** @type {import('next').NextConfig} */
export default {
  // node:sqlite is a builtin; keep it out of the server bundle.
  serverExternalPackages: ['node:sqlite'],
};
