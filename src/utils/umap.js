import { UMAP } from 'umap-js';

export function runUmapAsync(data, dimensions = 3, nNeighbors = 15, minDist = 0.1, epochs = 200, onProgress) {
  const umap = new UMAP({
    nComponents: dimensions, // Output dimensions
    nNeighbors: nNeighbors,  // Local-global balance
    minDist: minDist,        // Minimum distance between points
  });

  // Initialize UMAP
  umap.initializeFit(data);

  let currentStep = 0;

  // Perform incremental fitting asynchronously
  return new Promise((resolve) => {
    function stepUMAP() {
      if (currentStep < epochs) {
        umap.step(); // Perform one step
        currentStep++;

        // Call progress callback
        if (onProgress) {
          onProgress(currentStep, epochs);
        }

        // Schedule the next step
        requestAnimationFrame(stepUMAP);
      } else {
        // Resolve with the final embedding when done
        resolve(umap.getEmbedding());
      }
    }

    // Start the first step
    stepUMAP();
  });
}