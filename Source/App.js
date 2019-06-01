(function () {
    "use strict";

    //////////////////////////////////////////////////////////////////////////
    // Creating the Viewer
    //////////////////////////////////////////////////////////////////////////

    let viewer = new Cesium.Viewer('cesiumContainer');

    //////////////////////////////////////////////////////////////////////////
    // Loading Terrain
    //////////////////////////////////////////////////////////////////////////

    // Load Cesium World Terrain
    viewer.terrainProvider = Cesium.createWorldTerrain({
        requestWaterMask: true, // required for water effects
        requestVertexNormals: true // required for terrain lighting
    });
    // Enable depth testing so things behind the terrain disappear.
    viewer.scene.globe.depthTestAgainstTerrain = true;

    //////////////////////////////////////////////////////////////////////////
    // Loading Entity Data
    //////////////////////////////////////////////////////////////////////////

    let kmlOptions = {
        camera: viewer.scene.camera,
        canvas: viewer.scene.canvas,
    };

    // Load geocache points of interest from a KML file
    let fileName = './Source/SampleData/sampleGeocacheLocations.kml';
    let geocachePromise = Cesium.KmlDataSource.load(fileName, kmlOptions);

    // Add geocache entities to scene
    geocachePromise.then(function (dataSource) {
        viewer.dataSources.add(dataSource);
        let geocacheEntities = dataSource.entities.values;
        viewer.flyTo(geocacheEntities[0]);
        updateHeightForPolygonsWithRelativeToGroundaltitudeMode(geocacheEntities, fileName);
    });

    /**
     * We are looking for entities which are polygons with RelativeToGround altitudeMode
     * and then we update their height relative to the ground
     * @param geocacheEntities entities from .kml file
     * @param file .kml file name
     */
    function updateHeightForPolygonsWithRelativeToGroundaltitudeMode(geocacheEntities, file) {
        extractPlacemarkIDs(file).then(setOfIDs => {
            for (let i = 0; i < geocacheEntities.length; i++) {
                let entity = geocacheEntities[i];
                if (setOfIDs.has(entity.id)) {
                    entity.polygon.height = undefined;
                    entity.polygon.perPositionHeight = true;
                    let positions = entity.polygon.hierarchy._value.positions;
                    updatePositionsArrayWithTerrainHeight(positions, entity, false);
                    let holes = entity.polygon.hierarchy._value.holes;
                    for (let j = 0; j < holes.length; j++) {
                        updatePositionsArrayWithTerrainHeight(holes[j].positions, entity, true, j);
                    }
                }
            }
        });
    }

    /**
     * We're updating positions array with terrain height
     * @param positions initial array of positions
     * @param entity polygon entity
     * @param isHole false if positions are positions of polygon, true if positions are positions of hole in polygon
     * @param holePosition position of hole in array of holes
     */
    function updatePositionsArrayWithTerrainHeight(positions, entity, isHole, holePosition) {
        let positionHeights = [];
        let cartographicPositions = [];
        for (let j = 0; j < positions.length; j++) {
            cartographicPositions[j] = Cesium.Cartographic.fromCartesian(positions[j]);
            positionHeights[j] = cartographicPositions[j].height;
        }
        let promise = Cesium.sampleTerrain(viewer.terrainProvider, 11, cartographicPositions);
        Cesium.when(promise, function (updatedPositions) {
            for (let k = 0; k < updatedPositions.length; k++) {
                updatedPositions[k].height += positionHeights[k];
                updatedPositions[k] = Cesium.Cartographic.toCartesian(updatedPositions[k]);
            }
            if (!isHole) {
                let originalHoles = entity.polygon.hierarchy._value.holes;
                entity.polygon.hierarchy = new Cesium.PolygonHierarchy(updatedPositions, originalHoles);
            } else {
                let originalPositions = entity.polygon.hierarchy._value.positions;
                let holes = entity.polygon.hierarchy._value.holes;
                holes[holePosition] = new Cesium.PolygonHierarchy(updatedPositions);
                entity.polygon.hierarchy = new Cesium.PolygonHierarchy(originalPositions, holes);
            }
        });
    }

    /**
     * We are searching Placemarks which contain Polygon
     * with RelativeToGround altitudeMode
     * @param file .kml filename
     * @return Promise which returns set of Placemark IDs
     */
    function extractPlacemarkIDs(file) {
        return fetch(file)
            .then(response => response.text())
            .then(text => {
                let parser = new DOMParser();
                let kmlDoc = parser.parseFromString(text, "text/xml");
                let resultSetOfIDs = new Set();
                if (kmlDoc.documentElement.nodeName === "kml") {
                    let placemarks = kmlDoc.getElementsByTagName('Placemark');
                    for (let i = 0; i < placemarks.length; i++) {
                        let placemark = placemarks[i];
                        let placemarkID = placemarks[i].id;
                        let polygon = placemark.getElementsByTagName('Polygon')[0];
                        let altitudeMode = polygon.getElementsByTagName('altitudeMode')[0].innerHTML;
                        if (altitudeMode === 'RelativeToGround') {
                            resultSetOfIDs.add(placemarkID);
                        }
                    }
                } else {
                    throw "error while parsing";
                }
                return resultSetOfIDs;
            });
    }

}());
