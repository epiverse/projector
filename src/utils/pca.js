import { PCA } from 'ml-pca';

export function runPca(data, numberOfComponents = 5) {
  // Perform PCA
  const pca = new PCA(data, { center: true, scale: true });

  // Reduce data to 3 components
  const reducedData = pca.predict(data, { nComponents: numberOfComponents });

  // Get explained variance ratios
  const explainedVariance = pca.getExplainedVariance();

  return {
    data: reducedData.data,
    components: explainedVariance.slice(0, numberOfComponents),
  };

  console.log('Reduced Data (PC1, PC2, PC3):', reducedData);
  console.log('Explained Variance Ratios:', explainedVariance);
}