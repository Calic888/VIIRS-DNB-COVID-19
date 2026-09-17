var viirs=ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG");
var gradovi=ee.FeatureCollection("projects/zavrsniradcovid/assets/Gradovi_HR_shapefile");
var studyArea=gradovi.map(function(f){return f.buffer(1000);});
Map.centerObject(studyArea,7);
Map.addLayer(studyArea,{color:'red'},'Gradovi + 1 km');

function raster(y,m){
  var s=y+'-'+('0'+m).slice(-2)+'-01';
  var e=ee.Date(s).advance(1,'month').format('YYYY-MM-dd');
  return viirs.filterDate(s,e).select('avg_rad').mean().clip(studyArea);
}

var god=[2019,2020,2021,2022];
var mj=[6,7,8];
var im={};

god.forEach(function(y){
  mj.forEach(function(m){
    var n=(m==6?'Lipanj':m==7?'Srpanj':'Kolovoz');
    im[n+y]=raster(y,m);
    Map.addLayer(im[n+y],{min:0,max:120,
      palette:['black','blue','cyan','yellow','red']},
      n+' '+y,false);
  });
});

var names=['Lipanj','Srpanj','Kolovoz'];

function stats(img,y,m){
  return img.reduceRegions({
    collection:studyArea,
    reducer:ee.Reducer.mean().combine({
      reducer2:ee.Reducer.sum(),sharedInputs:true}),
    scale:500
  }).map(function(f){
    return f.set({
      Grad:f.get('name'),
      Godina:y,
      Mjesec:m
    });
  }).select(['Grad','Godina','Mjesec','mean','sum']);
}

var allStats=ee.FeatureCollection([]);
god.forEach(function(y){
  names.forEach(function(m){
    allStats=allStats.merge(stats(im[m+y],y,m));
  });
});

print('VIIRS – svi rezultati',allStats);

Export.table.toDrive({
  collection:allStats,
  description:'VIIRS_Gradovi_2019_2022_Mean_Sum',
  folder:'VIIRS_QGIS',
  fileFormat:'CSV'
});


/* GEO TIFF – 12 rastera */

god.forEach(function(y){
  names.forEach(function(m){
    Export.image.toDrive({
      image:im[m+y],
      description:'VIIRS_'+m+'_'+y,
      folder:'VIIRS_QGIS',
      fileNamePrefix:'VIIRS_'+m+'_'+y,
      region:studyArea.geometry(),
      scale:500,
      fileFormat:'GeoTIFF',
      maxPixels:1e13
    });
  });
});


/* KVANTITATIVNA ANALIZA – SRPANJ */

var gradoviA=gradovi.filter(
  ee.Filter.inList('name',['Zadar','Split','Dubrovnik'])
);
var areaA=gradoviA.map(function(f){return f.buffer(1000);});

function razlika(stara,nova,usp){
  var d=nova.subtract(stara).rename('razlika');
  var svi=ee.Image(1).updateMask(d.mask());
  var poz=ee.Image(1).updateMask(d.gt(0));
  var neg=ee.Image(1).updateMask(d.lt(0));

  return areaA.map(function(f){
    var g=f.geometry();

    var s=d.reduceRegion({
      reducer:ee.Reducer.mean().combine({
        reducer2:ee.Reducer.minMax(),sharedInputs:true}),
      geometry:g,scale:500,maxPixels:1e8
    });

    var total=ee.Number(svi.reduceRegion({
      reducer:ee.Reducer.sum(),
      geometry:g,scale:500,maxPixels:1e8
    }).get('constant'));

    var p=ee.Number(poz.reduceRegion({
      reducer:ee.Reducer.sum(),
      geometry:g,scale:500,maxPixels:1e8
    }).get('constant'));

    var n=ee.Number(neg.reduceRegion({
      reducer:ee.Reducer.sum(),
      geometry:g,scale:500,maxPixels:1e8
    }).get('constant'));

    return f.set({
      Grad:f.get('name'),
      Usporedba:usp,
      Srednja_razlika:s.get('razlika_mean'),
      Min_razlika:s.get('razlika_min'),
      Max_razlika:s.get('razlika_max'),
      Ukupno_piksela:total,
      Pozitivni_pikseli:p,
      Negativni_pikseli:n,
      Pozitivni_posto:p.divide(total).multiply(100),
      Negativni_posto:n.divide(total).multiply(100)
    });
  }).select([
    'Grad','Usporedba','Srednja_razlika',
    'Min_razlika','Max_razlika','Ukupno_piksela',
    'Pozitivni_pikseli','Negativni_pikseli',
    'Pozitivni_posto','Negativni_posto'
  ]);
}

var r20=razlika(im['Srpanj2019'],im['Srpanj2020'],'2020 - 2019');
var r21=razlika(im['Srpanj2020'],im['Srpanj2021'],'2021 - 2020');
var r22=razlika(im['Srpanj2021'],im['Srpanj2022'],'2022 - 2021');

var rezultati=r20.merge(r21).merge(r22);

print('KVANTITATIVNA ANALIZA RAZLIKA – SRPANJ',rezultati);

Export.table.toDrive({
  collection:rezultati,
  description:'VIIRS_Srpanj_Kvantitativne_Razlike',
  folder:'VIIRS_QGIS',
  fileNamePrefix:'VIIRS_Srpanj_Kvantitativne_Razlike',
  fileFormat:'CSV'
});
