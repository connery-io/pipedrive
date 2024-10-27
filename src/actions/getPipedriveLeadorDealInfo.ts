import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import axios from 'axios';

const actionDefinition: ActionDefinition = {
  key: 'getPipedriveLeadOrDealInfo',
  name: 'Get Pipedrive Lead or Deal Information',
  description: 'Retrieve comprehensive information about a Pipedrive lead or deal',
  type: 'read',
  inputParameters: [
    {
      key: 'pipedriveCompanyDomain',
      name: 'Pipedrive Company Domain',
      description: 'Your Pipedrive company domain (e.g. yourcompany.pipedrive.com)',
      type: 'string',
      validation: { required: true },
    },
    {
      key: 'pipedriveApiKey',
      name: 'Pipedrive API Key',
      description: 'Your Pipedrive API key',
      type: 'string',
      validation: { required: true },
    },
    {
      key: 'instructions',
      name: 'Instructions',
      description: 'Optional instructions for processing the lead or deal information',
      type: 'string',
      validation: { required: false },
    },
    {
      key: 'searchTerm',
      name: 'Search Term',
      description: 'Company name, contact name, or deal name to search for',
      type: 'string',
      validation: { required: true },
    },
  ],
  operation: {
    handler: handler,
  },
  outputParameters: [
    {
      key: 'textResponse',
      name: 'Text Response',
      description: 'The comprehensive lead or deal information',
      type: 'string',
      validation: { required: true },
    },
  ],
};

export default actionDefinition;

export async function handler({ input }: ActionContext): Promise<OutputObject> {
  const { pipedriveApiKey, companyDomain, searchTerm, instructions } = input;
  const fullDomain = `${companyDomain}.pipedrive.com`;

  try {
    const [leadResults, dealResults] = await Promise.all([
      searchPipedriveLead(pipedriveApiKey, fullDomain, searchTerm),
      searchPipedriveDeal(pipedriveApiKey, fullDomain, searchTerm)
    ]);

    const bestDeal = dealResults.data?.items?.length > 0
      ? findBestMatch(dealResults.data.items, searchTerm)
      : null;
    const bestLead = leadResults.data?.items?.length > 0
      ? findBestMatch(leadResults.data.items, searchTerm)
      : null;

    let info: any = {
      searchTerm,
      leadsFound: leadResults.data?.items?.length ?? 0,
      dealsFound: dealResults.data?.items?.length ?? 0,
    };

    if (bestDeal) {
      info.bestMatch = {
        type: 'deal',
        data: await getDealInfo(pipedriveApiKey, fullDomain, bestDeal.id)
      };
    } else if (bestLead) {
      info.bestMatch = {
        type: 'lead',
        data: await getLeadInfo(pipedriveApiKey, fullDomain, bestLead.id)
      };
    } else {
      info.message = "No exact matches found.";
      info.closestMatches = {
        deals: dealResults.data.items.slice(0, 3).map((item: any) => ({
          id: item.id,
          title: item.title
        })),
        leads: leadResults.data.items.slice(0, 3).map((item: any) => ({
          id: item.id,
          title: item.title
        }))
      };
    }

    // Function to remove null values
    function removeNulls(obj: any): any {
      return Object.fromEntries(
        Object.entries(obj)
          .filter(([_, v]) => v != null)
          .map(([k, v]) => [k, typeof v === 'object' ? removeNulls(v) : v])
      );
    }

    let cleanedInfo = removeNulls(info);
    let responseJson = JSON.stringify(cleanedInfo, null, 2);

    if (instructions) {
      responseJson = `Instructions for the following content: ${instructions}\n\n${responseJson}`;
    }

    if (responseJson.length > 90000) {
      responseJson = responseJson.substring(0, 90000);
    }

    return {
      textResponse: responseJson,
    };
  } catch (error) {
    throw new Error(`Failed to process request: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function searchPipedriveLead(apiKey: string, companyDomain: string, searchTerm: string) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const url = `${baseUrl}/leads/search`;

  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };
  const params = { 
    term: searchTerm, 
    fields: 'title,custom_fields,notes',
    exact_match: false,
    limit: 10
  };

  try {
    const response = await axios.get(url, { headers, params });
    return response.data;
  } catch (error) {
    console.error('Error searching for lead:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
    }
    return { data: { items: [] } };
  }
}

async function searchPipedriveDeal(apiKey: string, companyDomain: string, searchTerm: string) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const url = `${baseUrl}/deals/search`;

  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };
  const params = { 
    term: searchTerm, 
    fields: 'title,custom_fields,notes',
    exact_match: false,
    limit: 10
  };

  try {
    const response = await axios.get(url, { headers, params });
    return response.data;
  } catch (error) {
    console.error('Error searching for deal:', error);
    if (axios.isAxiosError(error)) {
      console.error('Response data:', error.response?.data);
    }
    return { data: [] };
  }
}

function findBestMatch(items: any[], searchTerm: string): any | null {
  if (!items || items.length === 0) return null;

  const searchTermLower = searchTerm.toLowerCase();
  return items.reduce((best, item) => {
    const currentItem = item.item || item;
    const score = (currentItem.title?.toLowerCase().includes(searchTermLower) ? 3 : 0) +
                  (currentItem.organization?.name?.toLowerCase().includes(searchTermLower) ? 2 : 0) +
                  (currentItem.person?.name?.toLowerCase().includes(searchTermLower) ? 1 : 0);
    
    return (score > best.score || (score === best.score && item.result_score > best.resultScore)) 
      ? { item: currentItem, score, resultScore: item.result_score } 
      : best;
  }, { item: null, score: -1, resultScore: -1 }).item;
}

async function getLeadInfo(apiKey: string, companyDomain: string, leadId: string) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };

  try {
    const leadInfo = await axios.get(`${baseUrl}/leads/${leadId}`, { headers });

    let activities = [];
    let notes = [];

    try {
      const activitiesResponse = await axios.get(`${baseUrl}/leads/${leadId}/activities`, { headers });
      activities = activitiesResponse.data.data || [];
    } catch (error) {
      console.warn('Failed to fetch lead activities:', error instanceof Error ? error.message : String(error));
    }

    try {
      const notesResponse = await axios.get(`${baseUrl}/leads/${leadId}/notes`, { headers });
      notes = notesResponse.data.data || [];
    } catch (error) {
      console.warn('Failed to fetch lead notes:', error instanceof Error ? error.message : String(error));
    }

    return {
      lead: leadInfo.data.data,
      activities,
      notes,
    };
  } catch (error) {
    console.error('Error fetching lead info:', error instanceof Error ? error.message : String(error));
    if (axios.isAxiosError(error) && error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw new Error(`Failed to fetch lead info: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getDealInfo(apiKey: string, companyDomain: string, dealId: number) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const url = `${baseUrl}/deals/${dealId}`;

  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };
  const params = { get_all_custom_fields: true };

  try {
    const dealInfo = await axios.get(url, { headers, params });
    const activities = await axios.get(`${baseUrl}/deals/${dealId}/activities`, { headers });
    const notes = await axios.get(`${baseUrl}/deals/${dealId}/notes`, { headers });

    return {
      deal: dealInfo.data.data,
      activities: activities.data.data,
      notes: notes.data.data,
    };
  } catch (error) {
    console.error('Error fetching deal info:', error instanceof Error ? error.message : String(error));
    throw new Error(`Failed to fetch deal info: ${error instanceof Error ? error.message : String(error)}`);
  }
}
