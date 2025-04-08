var roi = ee.FeatureCollection("projects/ee-kobinaamens/assets/MCS");
// Define region of interest (use your ROI asset)
var roi = ee.FeatureCollection('projects/ee-kobinaamens/assets/MCS'); // Update this
Map.centerObject(roi, 6);
Map.addLayer(roi, {color: 'red'}, 'ROI');

// Define years range
var startYear = 2000;
var endYear = 2024;

// Load and preprocess MODIS NDVI
var modisNDVI = ee.ImageCollection('MODIS/061/MOD13A2')
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .select('NDVI')
  .map(function(img) {
    return img.multiply(0.0001).copyProperties(img, ['system:time_start']);
  });

// Load and preprocess MODIS ET
var modisET = ee.ImageCollection('MODIS/006/MOD16A2')
  .filterDate(startYear + '-01-01', endYear + '-12-31')
  .select('ET')
  .map(function(img) {
    return img.copyProperties(img, ['system:time_start']);
  });

// Function to compute yearly mean NDVI and ET
var yearlyData = ee.List.sequence(startYear, endYear).map(function(year) {
  year = ee.Number(year);
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');

  var ndviYear = modisNDVI.filterDate(start, end).mean().clip(roi);
  var etYear = modisET.filterDate(start, end).mean().clip(roi);

  var ndviMean = ndviYear.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: roi,
    scale: 1000,
    maxPixels: 1e9
  }).get('NDVI');

  var etMean = etYear.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: roi,
    scale: 500,
    maxPixels: 1e9
  }).get('ET');

  return ee.Feature(null, {
    'year': year,
    'NDVI': ndviMean,
    'ET': etMean
  });
});

// Convert to FeatureCollection
var trendCollection = ee.FeatureCollection(yearlyData);

// Print the time series collection
print('ET & NDVI Yearly Mean:', trendCollection);

// === Trend Chart ===
var chart = ui.Chart.feature.byFeature({
  features: trendCollection,
  xProperty: 'year',
  yProperties: ['NDVI', 'ET']
}).setChartType('LineChart')
  .setOptions({
    title: 'ET and NDVI Trend (2000–2024)',
    hAxis: {title: 'Year'},
    vAxis: {title: 'Value'},
    lineWidth: 2,
    pointSize: 4,
    series: {
      0: {color: 'green', label: 'NDVI'},
      1: {color: 'blue', label: 'ET'}
    }
  });

print(chart);

// === Compute Correlation ===
var correlation = trendCollection.aggregate_array('NDVI')
  .zip(trendCollection.aggregate_array('ET'))
  .map(function(pair) {
    return ee.Dictionary({NDVI: ee.List(pair).get(0), ET: ee.List(pair).get(1)});
  });

var stats = trendCollection.reduceColumns(ee.Reducer.pearsonsCorrelation(), ['NDVI', 'ET']);
print('Correlation Coefficient (NDVI vs ET):', stats.get('correlation'));

// === Export Yearly Mean Maps of ET and NDVI ===
var exportYears = ee.List.sequence(startYear, endYear);
exportYears.evaluate(function(years) {
  years.forEach(function(year) {
    var y = ee.Number(year);
    var start = ee.Date.fromYMD(y, 1, 1);
    var end = start.advance(1, 'year');

    var ndviYear = modisNDVI.filterDate(start, end).mean().clip(roi);
    var etYear = modisET.filterDate(start, end).mean().clip(roi);

    Export.image.toDrive({
      image: ndviYear,
      description: 'NDVI_' + y.format(),
      folder: 'GEE_NDVI_Exports',
      region: roi.geometry(),
      scale: 1000,
      maxPixels: 1e13
    });

    Export.image.toDrive({
      image: etYear,
      description: 'ET_' + y.format(),
      folder: 'GEE_ET_Exports',
      region: roi.geometry(),
      scale: 500,
      maxPixels: 1e13
    });
  });
});
