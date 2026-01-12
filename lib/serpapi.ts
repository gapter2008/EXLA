// SerpAPI helper for Google search results

interface SerpApiResult {
  title: string;
  link: string;
  snippet?: string;
  domain?: string;
}

export async function searchGoogle(query: string, apiKey: string): Promise<SerpApiResult[]> {
  try {
    const response = await fetch(
      `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SerpAPI request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const organicResults = data.organic_results || [];

    return organicResults.map((result: any) => {
      const link = result.link || '';
      let domain = '';
      try {
        domain = new URL(link).hostname.replace('www.', '');
      } catch {
        // Invalid URL, skip domain extraction
      }

      return {
        title: result.title || '',
        link: link,
        snippet: result.snippet || '',
        domain: domain,
      };
    });
  } catch (error: any) {
    console.error('SerpAPI search error:', error);
    throw new Error(`Failed to search Google: ${error.message}`);
  }
}

// Extract brand name from title/domain (simple heuristic)
export function extractBrandName(title: string, domain: string): string {
  // Try to extract from title first (remove common suffixes)
  let name = title
    .replace(/\s*[-–—]\s*Official.*/i, '')
    .replace(/\s*[-–—]\s*Home.*/i, '')
    .replace(/\s*\|\s*.*/g, '')
    .replace(/\s*-\s*.*$/g, '')
    .trim();

  // If title doesn't look good, use domain
  if (!name || name.length > 50) {
    name = domain
      .replace(/^www\./, '')
      .replace(/\.[a-z]{2,}$/, '')
      .split('.')
      .slice(-2, -1)[0] || domain;
    
    // Capitalize first letter
    name = name.charAt(0).toUpperCase() + name.slice(1);
  }

  return name || domain;
}

