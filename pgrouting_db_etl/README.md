# shst tile-hierarchy level and shst NPMRDS matched output

From the sharedstreets-js [docs](https://github.com/sharedstreets/sharedstreets-js#options-1)

> --tile-hierarchy=[number]: [default: 6]
> SharedStreets tile hierarchy, which refers to the OSM data model.
> Level 6 includes unclassified roads and above.
>	Level 7 includes service roads and above.
>	Level 8 includes other features, like bike and pedestrian paths.

When running shst match on the NPMRDS shapefile GeoJSON,
the number of matches differs with different shst tile-hierarchy levels.

The following is the output when shst match is run on Columbia County.

shst tile-hierarchy | matched | unmatched
--- | --- | ---
6 | 2380 | 11
7 | 2931 | 15
8 | 3074 | 15

This is contrary to what I expected. NPMRDS seems to only contain level 6 roads. 
I expected the number of matches to be unaffected by higher tile-hierarchies.

_Why does the matching algorithm treat them differently when other road types
are included in matching?_

My hypothesis is that more interections are created when using the 
higher resolution tile-hierarchies (7 & 8). This creates more SharedStreet references.
If this is true, the finer road network splitting will help with RIS/NPMRDS conflation.
However, we need to make sure that NPMRDS TMC matching accuracy is not affected.

# Processing Errors

I encountered this error while processing all of NYS:

> Unable to build graph: RangeError: index out of range: 261795 + 32 > 261822

Partition sizes were 8192. I reduced them to 1028, and tried
```
rm -rf ~/.shst
```

Seemed to work as far as getting past the error.
Not sure what the implications are.
Could it possibly affect sharedstreet IDs?

---
