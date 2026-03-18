# DidHub: Basic Usage Guide

Welcome to DidHub. This guide walks you through the core, end-to-end workflows you’ll use as a daily user. It focuses on practical tasks you can perform in the web interface to manage data, build workflows, and share results.

## Getting started
- Sign in or sign up for a DidHub account.
- From the dashboard, create your first project. A project is a container for data, workflows, and results.
- Explore the main sections in the left navigation: Projects, Data, Workflows, Models, Exports, and Settings.

## Working with data
- Create or import a dataset into your project. Supported formats typically include CSV, JSON, and TSV.
- Preview the dataset to check columns, sample rows, and data types.
- Organize data with simple labels or tags to make it easy to find later.

## Building and running a workflow
- Create a new workflow for a concrete task, such as cleaning data and generating a summary report.
- Add workflow steps. A typical sequence might include:
  - Load data from your dataset
  - Clean and transform rows (remove duplicates, normalize formats)
  - Compute key metrics and generate a summary
  - Save or export the results as a report or dataset
- Run the workflow. Monitor progress in the Jobs/Workflow panel. You can see status, progress bars, and logs.
- If needed, pause, re-run, or edit steps and re-run to reproduce results.

## Viewing and exporting results
- Open the results tab to view outputs produced by your workflow.
- Download results in common formats (CSV, JSON, or a readable report) or export them back into a new dataset within DidHub.
- Share results with teammates by granting access at the project level or by sharing a link to a specific artifact.

## Common use cases
- Quick data cleanup and summary: import a raw dataset, run a cleanup workflow, and export a clean report.
- Reproducible data processing: save a workflow that performs the same steps on new data, ensuring consistent results.
- Collaborative projects: invite teammates, assign tasks, and track progress from the shared dashboard.

## Example workflows
- Example 1: Quick data cleanup and report
  1) Create a project named “Q2 Sales”.
  2) Import the raw sales data CSV.
  3) Create a workflow with steps: Load data → Clean data (trim spaces, fix dates) → Generate summary metrics → Export report as PDF.
  4) Run the workflow and review the PDF report in Exports.
- Example 2: Simple collaboration
  1) Create a project and invite a teammate.
  2) Upload a dataset and create a shared workflow.
  3) Assign a task to your teammate to review the clean data step.
  4) Collaborate using the built-in comments and task status indicators.

## Main features you interact with
- Projects: organize data, workflows, and results per initiative.
- Data: store, label, and preview datasets.
- Workflows: design and run reproducible sequences of data tasks.
- Exports: generate shareable outputs and reports.
- Collaboration: invite teammates, assign tasks, and track progress.
- Settings: manage account preferences, notifications, and project access.

## Tips for effective use
- Start with a small dataset to learn the workflow and gradually scale up.
- Name projects and datasets clearly to avoid confusion.
- Use a consistent workflow template for common data tasks.
- Regularly export important results for backup and sharing.

## Troubleshooting common issues
- Data import failing: check file format, encoding, and size limits.
- Workflow stuck or slow: review the step-by-step logs, ensure data is available, and retry.
- Access issues: verify your role within the project and confirm you have been granted access.

## How to get help
- Use the in-app Help or Support section for guided help.
- If you still need assistance, contact DidHub support with details about your project, dataset, and steps you followed.

## Quick glossary
- Project: A container for related data, workflows, and results.
- Dataset: A data file or collection of rows, used by workflows.
- Workflow: A sequence of steps that processes data to produce outputs.
- Export: A downloadable artifact such as a report or dataset.
- Job/Workflow Run: An execution instance of a workflow.
- Model: An AI model you might deploy or use within a project.

End of file
