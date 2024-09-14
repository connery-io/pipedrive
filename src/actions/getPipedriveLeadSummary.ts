import { ActionDefinition, ActionContext, OutputObject } from 'connery';
import OpenAI from 'openai';
import axios from 'axios';

const actionDefinition: ActionDefinition = {
  key: 'getPipedriveLeadOrDealSummary',
  name: 'Get Pipedrive Lead or Deal Status or Summary',
  description: 'Receive a status or summary from a Pipedrive lead or deal using OpenAI',
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
      key: 'openaiApiKey',
      name: 'OpenAI API Key',
      description: 'Your OpenAI API key',
      type: 'string',
      validation: { required: true },
    },
    {
      key: 'openaiModel',
      name: 'OpenAI Model',
      description: 'The OpenAI model to use (e.g., gpt-4o)',
      type: 'string',
      validation: { required: true },
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
      description: 'The summarized lead or deal information',
      type: 'string',
      validation: { required: true },
    },
  ],
};

export default actionDefinition;

export async function handler({ input }: ActionContext): Promise<OutputObject> {
  const { pipedriveCompanyDomain, pipedriveApiKey, openaiApiKey, openaiModel, searchTerm } = input;

  //console.log('Handler function started');
  //console.log(`Search Term: ${searchTerm}`);

  const fullDomain = pipedriveCompanyDomain.includes('.pipedrive.com') 
    ? pipedriveCompanyDomain 
    : `${pipedriveCompanyDomain}.pipedrive.com`;

  try {
    //console.log('Searching for Pipedrive lead or deal...');
    const leadResults = await searchPipedriveLead(pipedriveApiKey, fullDomain, searchTerm);
    const dealResults = await searchPipedriveDeal(pipedriveApiKey, fullDomain, searchTerm);

    //console.log('Lead Results:', JSON.stringify(leadResults, null, 2));
    //console.log('Deal Results:', JSON.stringify(dealResults, null, 2));

    const bestLead = leadResults.data && leadResults.data.items 
      ? findBestMatch(leadResults.data.items.map((item: any) => item.item), searchTerm)
      : null;
    const bestDeal = dealResults.data && dealResults.data.items
      ? findBestMatch(dealResults.data.items.map((item: any) => item.item), searchTerm)
      : null;

    let summaryData;
    if (bestLead && (!bestDeal || bestLead.result_score > bestDeal.result_score)) {
      summaryData = { type: 'lead', ...bestLead };
    } else if (bestDeal) {
      const activities = await getActivitiesForDeal(pipedriveApiKey, fullDomain, bestDeal.id);
      summaryData = { type: 'deal', ...bestDeal, activities };
    } else {
      throw new Error('No matching leads or deals found');
    }

    //console.log('Generating summary...');
    const summary = await generateSummary(openaiApiKey, openaiModel, summaryData);

    return {
      textResponse: summary,
    };
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    throw new Error(`Failed to process request: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function searchPipedriveLead(apiKey: string, companyDomain: string, searchTerm: string) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };

  try {
    //console.log(`Searching lead with URL: ${baseUrl}/leads/search`);
    const response = await axios.get(`${baseUrl}/leads/search`, {
      headers,
      params: { 
        term: searchTerm, 
        fields: 'title,custom_fields,notes',
        exact_match: false,
        limit: 10
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error searching for lead:', error.message);
      console.error('Response data:', error.response?.data);
    } else {
      console.error('Error searching for lead:', error instanceof Error ? error.message : String(error));
    }
    return { data: { items: [] } };
  }
}

async function searchPipedriveDeal(apiKey: string, companyDomain: string, searchTerm: string) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };

  try {
    //console.log(`Searching deal with URL: ${baseUrl}/deals/search`);
    const response = await axios.get(`${baseUrl}/deals/search`, {
      headers,
      params: { 
        term: searchTerm, 
        fields: 'title,custom_fields,notes',
        exact_match: false,
        limit: 10
      },
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error searching for deal:', error.message);
      console.error('Response data:', error.response?.data);
    } else {
      console.error('Error searching for deal:', error instanceof Error ? error.message : String(error));
    }
    return { data: [] };
  }
}

function findBestMatch(items: any[], searchTerm: string): any | null {
  if (!Array.isArray(items)) {
    //console.error('findBestMatch: items is not an array', items);
    return null;
  }

  const searchTermLower = searchTerm.toLowerCase();
  return items.reduce((best, current) => {
    const titleMatch = (current.title || '').toLowerCase().includes(searchTermLower);
    const orgMatch = (current.organization?.name || '').toLowerCase().includes(searchTermLower);
    const personMatch = (current.person?.name || '').toLowerCase().includes(searchTermLower);
    
    if (titleMatch || orgMatch || personMatch) {
      if (!best || (current.result_score && current.result_score > best.result_score)) {
        return current;
      }
    }
    return best;
  }, null);
}

async function getActivitiesForDeal(apiKey: string, companyDomain: string, dealId: number) {
  const baseUrl = `https://${companyDomain}/api/v1`;
  const headers = { 'x-api-token': apiKey, 'Accept': 'application/json' };

  try {
    const response = await axios.get(`${baseUrl}/deals/${dealId}/activities`, {
      headers,
      params: { limit: 5, sort: 'due_date DESC' },
    });
    return response.data.data;
  } catch (error) {
    console.error('Error fetching activities:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

async function generateSummary(apiKey: string, model: string, data: any) {
  const openai = new OpenAI({ apiKey });

  const prompt = `
  Summarize the following Pipedrive ${data.type} information in a concise and well-readable format that fits on one screen:
  
  ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}: ${JSON.stringify(data)}
  
  Please adhere to the following guidelines:
  
  - ${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Overview: Summarize in two lines, including status and source if available. Always add lead/deal source if given, and omit any cryptic IDs.
  - Company Information: Present all available company details in one line, emphasizing any size information.
  - Contact Details: Provide one line per contact, always including phone and email if available.
  - Notes and Activities: Avoid duplicating content. If there's overlap between notes and activities, combine them. Include duration if given. Provide one line per activity.
  ${data.type === 'deal' ? `- Activities: List the most recent activities or next steps, one line per activity.` : ''}
  ${data.type === 'lead' ? `- Deals Information: State "No deals are currently associated with this lead as it has not been converted to a deal yet."` : ''}
  - Overall Next Steps: Include only if explicitly stated in the input; do not make up any information.
  
  Output should be in plain text without any special formatting.
  
  Use only the information provided above. Do not add any information that is not present in the given data.
  `;

  /*
  const prompt = `
    Summarize the following Pipedrive ${data.type} information in a structured and well-readable format:

    ${data.type.charAt(0).toUpperCase() + data.type.slice(1)}: ${JSON.stringify(data)}

    Please include the following sections:
    1. ${data.type.charAt(0).toUpperCase() + data.type.slice(1)} Overview (leave out cryptic IDs)
    2. Company Information (address, location and postal code info in one line, any info on annual spend or company size is important)
    3. Contact Details (include everything that is available, organize all info in onle line for each available contact)
    4. Notes Summary (explicitly include information about source, spend, information on company size, contact details, and next steps, if any)
    ${data.type === 'deal' ? `5. Activities (list the most recent activities or next steps)` : ''}
    ${data.type === 'lead' ? `5. Deals Information: Explicitly state "No deals are currently associated with this lead as it has not been converted to a deal yet."` : ''}
    6. Overall Next Steps (do not make up anything here, only add if clear from the input. If nothing was found in the input, mention that in your output).

    Use only the information provided above. Do not add any information that is not present in the given data.
  `;*/

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that summarizes Pipedrive lead and deal information.' },
        { role: 'user', content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No summary generated');
    return content.trim();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to generate summary: ${errorMessage}`);
  }
}
