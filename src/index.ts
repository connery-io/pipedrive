import { PluginDefinition, setupPluginServer } from 'connery';
import getPipedriveLeadSummary from './actions/getPipedriveLeadorDealInfo.js';

const pluginDefinition: PluginDefinition = {
  name: 'Pipedrive',
  description: 'Read and write content to your Pipedrive CRM',
  actions: [getPipedriveLeadSummary],
};

const handler = await setupPluginServer(pluginDefinition);
export default handler;
