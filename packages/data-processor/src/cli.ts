import { runProcessPipeline } from './pipeline.js';

/** Run the full data processing pipeline */
async function runProcess(): Promise<void> {
  const result = await runProcessPipeline();
  console.log(`Reading raw data from ${result.rawDir}`);
  console.log(`Processed data saved to ${result.outputDir}`);
  console.log(`Fetched profiles: ${String(result.fetchedProfiles)}`);
  console.log(
    `Evaluated: ${String(result.identifiedCount)} / ${String(result.candidateCount)} candidates`
  );
}

runProcess().catch((err: unknown) => {
  console.error('Processing failed:', err);
  process.exit(1);
});
