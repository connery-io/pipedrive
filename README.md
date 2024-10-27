# Pipedrive

Connery plugin for Pipedrive. Its purpose is to retrieve information from Pipedrive.

The plugin currently contains one action: `getPipedriveLeadOrDealInfo`.

- Allows you to search for a lead or deal by name and retrieve detailed information about it.
- Optionally, you can provide instructions for for the Connery assistant on how to handle the content.
  - This can be useful if the table contains additional information that should not be used for answering the question.
  - It can also be used to provide more context or output formatting instructions.
- The action returns a JSON object with the lead or deal information. Very long content is truncated to 90,000 characters.

## Repository structure

This repository contains the plugin's source code.

| Path                            | Description                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [./src/index.ts](/src/index.ts) | **The entry point for the plugin.** It contains the plugin definition and references to all the actions.                                             |
| [./src/actions/](/src/actions/) | **This folder contains all the actions of the plugin.** Each action is represented by a separate file with the action definition and implementation. |

## Built using Connery SDK

This plugin is built using [Connery SDK](https://github.com/connery-io/connery-sdk), the open-source SDK for creating AI plugins and actions.

[Learn how to use the plugin and its actions.](https://sdk.connery.io/docs/quickstart/use-plugin)

## Support

If you have any questions or need help with this plugin, please create an issue in this repository.
