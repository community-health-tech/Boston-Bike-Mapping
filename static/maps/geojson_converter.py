import json
from pyproj import Transformer

SOURCE_PROJ = "NAD_1983_StatePlane_Massachusetts_Mainland_FIPS_2001_Feet"
DEST_PROJ = "epsg:4326"
US_FEET_TO_METER = 0.3048006096012192

transformer = Transformer.from_crs(SOURCE_PROJ, DEST_PROJ)


def get_lat_long_list(list_of_bng_coords):
    return map(get_lat_long, list_of_bng_coords)


def get_lat_long(nad_coord):
    longlat = transformer.transform(nad_coord[0], nad_coord[1])
    print(longlat[1])
    return (longlat[1], longlat[0])

def open_file_and_output_latlong(infile, outfile):
    with open(infile, 'r') as f:
        data = json.load(f)

    for tract in data["features"]:
        print(tract["properties"])
        tract["geometry"]["coordinates"][0] = list(get_lat_long_list(tract["geometry"]["coordinates"][0]))

    with open(outfile, "w") as write_file:
        json.dump(data, write_file)


open_file_and_output_latlong("in.json", "out2.geojson")
