export default async () => {
  const siteUrl = process.env.URL || 'https://porra-futbol.netlify.app';

  const response = await fetch(`${siteUrl}/api/sync-openfootball`, {
    method: 'GET',
    headers: {
      'Cache-Control': 'no-cache',
    },
  });

  const text = await response.text();

  console.log('Sync OpenFootball status:', response.status);
  console.log('Sync OpenFootball response:', text);
};

export const config = {
  schedule: '*/15 * * * *',
};
