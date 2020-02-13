import { clone, isArrayOfArrays, isArrayOfObjectsOrEmpty, isArrayOfObjects } from './utility'
import { leastSquares } from './smoothers'
import { sum, histogram } from 'd3-array'

export function processScaleTicks (args, axis) {
  let accessor
  let scaleTicks
  let max

  if (axis === 'x') {
    accessor = args.xAccessor
    scaleTicks = args.scales.X.ticks(args.xax_count)
    max = args.processed.max_x
  } else if (axis === 'y') {
    accessor = args.y_accessor
    scaleTicks = args.scales.Y.ticks(args.yax_count)
    max = args.processed.max_y
  }

  function log10 (val) {
    if (val === 1000) {
      return 3
    }
    if (val === 1000000) {
      return 7
    }
    return Math.log(val) / Math.LN10
  }

  if ((axis === 'x' && args.x_scale_type === 'log') || (axis === 'y' && args.y_scale_type === 'log')) {
    // get out only whole logs
    scaleTicks = scaleTicks.filter(function (d) {
      return Math.abs(log10(d)) % 1 < 1e-6 || Math.abs(log10(d)) % 1 > 1 - 1e-6
    })
  }

  // filter out fraction ticks if our data is ints and if xmax > number of generated ticks
  const numberOfTicks = scaleTicks.length

  // is our data object all ints?
  let dataIsInt = true
  args.data.forEach(function (d, i) {
    d.forEach(function (d, i) {
      if (d[accessor] % 1 !== 0) {
        dataIsInt = false
        return false
      }
    })
  })

  if (dataIsInt && numberOfTicks > max && args.format === 'count') {
    // remove non-integer ticks
    scaleTicks = scaleTicks.filter(function (d) {
      return d % 1 === 0
    })
  }

  if (axis === 'x') {
    args.processed.x_ticks = scaleTicks
  } else if (axis === 'y') {
    args.processed.y_ticks = scaleTicks
  }
}

export function rawDataTransformation (args) {
  // dupe our data so we can modify it without adverse effect
  args.data = clone(args.data)

  // we need to account for a few data format cases:
  // #0 {bar1:___, bar2:___}                                    // single object (for, say, bar charts)
  // #1 [{key:__, value:__}, ...]                               // unnested obj-arrays
  // #2 [[{key:__, value:__}, ...], [{key:__, value:__}, ...]]  // nested obj-arrays
  // #3 [[4323, 2343],..]                                       // unnested 2d array
  // #4 [[[4323, 2343],..] , [[4323, 2343],..]]                 // nested 2d array
  args.single_object = false // for bar charts.
  args.array_of_objects = false
  args.array_of_arrays = false
  args.nested_array_of_arrays = false
  args.nested_array_of_objects = false

  // is the data object a nested array?
  if (isArrayOfArrays(args.data)) {
    args.nested_array_of_objects = args.data.map(function (d) {
      return isArrayOfObjectsOrEmpty(d)
    }) // Case #2
    args.nested_array_of_arrays = args.data.map(function (d) {
      return isArrayOfArrays(d)
    }) // Case #4
  } else {
    args.array_of_objects = isArrayOfObjects(args.data) // Case #1
    args.array_of_arrays = isArrayOfArrays(args.data) // Case #3
  }

  if (args.chart_type === 'line' && (args.array_of_objects || args.array_of_arrays)) {
    args.data = [args.data]
  } else if (!Array.isArray(args.data[0])) {
    args.data = [args.data]
  }
  // if the y_accessor is an array, break it up and store the result in args.data
  processMultipleXAccessors(args)
  processMultipleYAccessors(args)

  // if user supplies keyword in args.color, change to arg.colors.
  // this is so that the API remains fairly sensible and legible.
  if (args.color !== undefined) args.colors = args.color

  // if user has supplied args.colors, and that value is a string, turn it into an array.
  if (args.colors !== null && typeof args.colors === 'string') args.colors = [args.colors]

  // sort x-axis data
  if (args.chart_type === 'line' && args.x_sort === true) {
    for (let i = 0; i < args.data.length; i++) {
      args.data[i].sort(function (a, b) {
        return a[args.xAccessor] - b[args.xAccessor]
      })
    }
  }

  return this
}

export function processMultipleAccessors (args, whichAccessor) {
  // turns an array of accessors into ...
  if (Array.isArray(args[whichAccessor])) {
    args.data = args.data.map(function (_d) {
      return args[whichAccessor].map(function (ya) {
        return _d.map(function (di) {
          di = clone(di)

          if (di[ya] === undefined) {
            return undefined
          }

          di['multiline_' + whichAccessor] = di[ya]
          return di
        }).filter(function (di) {
          return di !== undefined
        })
      })
    })[0]
    args[whichAccessor] = 'multiline_' + whichAccessor
  }
}

export function processMultipleXAccessors (args) {
  processMultipleAccessors(args, 'xAccessor')
}

export function processMultipleYAccessors (args) {
  processMultipleAccessors(args, 'y_accessor')
}

export function processLine (args) {
  'use strict'

  let timeFrame

  // do we have a time-series?
  const isTimeSeries = sum(args.data.map(function (series) {
    return series.length > 0 && series[0][args.xAccessor] instanceof Date
  })) > 0

  // are we replacing missing y values with zeros?
  if ((args.missing_is_zero || args.missing_is_hidden) && args.chart_type === 'line' && isTimeSeries) {
    for (let i = 0; i < args.data.length; i++) {
      // we need to have a dataset of length > 2, so if it's less than that, skip
      if (args.data[i].length <= 1) {
        continue
      }

      const first = args.data[i][0]
      const last = args.data[i][args.data[i].length - 1]

      // initialize our new array for storing the processed data
      const processedData = []

      // we'll be starting from the day after our first date
      const startDate = clone(first[args.xAccessor]).setDate(first[args.xAccessor].getDate() + 1)

      // if we've set a max_x, add data points up to there
      const from = (args.min_x) ? args.min_x : startDate
      const upto = (args.max_x) ? args.max_x : last[args.xAccessor]

      timeFrame = getTimeFrame((upto - from) / 1000)

      if (['four-days', 'many-days', 'many-months', 'years', 'default'].indexOf(timeFrame) !== -1 && args.missing_is_hidden_accessor === null) {
        // changing the date via setDate doesn't properly register as a change within the loop
        for (let d = new Date(from); d <= upto; d.setDate(d.getDate() + 1)) { // eslint-disable-line
          const o = {}
          d.setHours(0, 0, 0, 0)

          // add the first date item, we'll be starting from the day after our first date
          if (Date.parse(d) === Date.parse(new Date(startDate))) {
            processedData.push(clone(args.data[i][0]))
          }

          // check to see if we already have this date in our data object
          let existingO = null
          args.data[i].forEach(function (val, i) {
            if (Date.parse(val[args.xAccessor]) === Date.parse(new Date(d))) {
              existingO = val

              return false
            }
          })

          // if we don't have this date in our data object, add it and set it to zero
          if (!existingO) {
            o[args.xAccessor] = new Date(d)
            o[args.y_accessor] = 0
            o._missing = true // we want to distinguish between zero-value and missing observations
            processedData.push(o)

          // if the data point has, say, a 'missing' attribute set or if its
          // y-value is null identify it internally as missing
          } else if (existingO[args.missing_is_hidden_accessor] || existingO[args.y_accessor] === null) {
            existingO._missing = true
            processedData.push(existingO)

          // otherwise, use the existing object for that date
          } else {
            processedData.push(existingO)
          }
        }
      } else {
        for (let j = 0; j < args.data[i].length; j += 1) {
          const obj = clone(args.data[i][j])
          obj._missing = args.data[i][j][args.missing_is_hidden_accessor]
          processedData.push(obj)
        }
      }

      // update our date object
      args.data[i] = processedData
    }
  }

  return this
}

export function processHistogram (args) {
  'use strict'

  // if args.binned == false, then we need to bin the data appropriately.
  // if args.binned == true, then we need to make sure to compute the relevant computed data.
  // the outcome of either of these should be something in args.computed_data.
  // the histogram plotting function will be looking there for the data to plot.

  // we need to compute an array of objects.
  // each object has an x, y, and dx.

  // histogram data is always single dimension
  const ourData = args.data[0]

  let extractedData
  if (args.binned === false) {
    // use d3's built-in layout.histogram functionality to compute what you need.

    if (typeof (ourData[0]) === 'object') {
      // we are dealing with an array of objects. Extract the data value of interest.
      extractedData = ourData
        .map(function (d) {
          return d[args.xAccessor]
        })
    } else if (typeof (ourData[0]) === 'number') {
      // we are dealing with a simple array of numbers. No extraction needed.
      extractedData = ourData
    } else {
      console.log('TypeError: expected an array of numbers, found ' + typeof (ourData[0]))
      return
    }

    const hist = histogram()
    if (args.bins) {
      hist.thresholds(args.bins)
    }

    const bins = hist(extractedData)
    args.processedData = bins.map(function (d) {
      return { x: d.x0, y: d.length }
    })
  } else {
    // here, we just need to reconstruct the array of objects
    // take the x accessor and y accessor.
    // pull the data as x and y. y is count.

    args.processedData = ourData.map(function (d) {
      return { x: d[args.xAccessor], y: d[args.y_accessor] }
    })

    let thisPt
    let nextPt

    // we still need to compute the dx component for each data point
    for (let i = 0; i < args.processedData.length; i++) {
      thisPt = args.processedData[i]
      if (i === args.processedData.length - 1) {
        thisPt.dx = args.processedData[i - 1].dx
      } else {
        nextPt = args.processedData[i + 1]
        thisPt.dx = nextPt.x - thisPt.x
      }
    }
  }

  // capture the original data and accessors before replacing args.data
  if (!args.processed) {
    args.processed = {}
  }
  args.processed.original_data = args.data
  args.processed.original_xAccessor = args.xAccessor
  args.processed.original_y_accessor = args.y_accessor

  args.data = [args.processedData]
  args.xAccessor = args.processed_xAccessor
  args.y_accessor = args.processed_y_accessor

  return this
}

export function processPoint (args) {
  'use strict'

  const data = args.data[0]
  const x = data.map(function (d) {
    return d[args.xAccessor]
  })
  const y = data.map(function (d) {
    return d[args.y_accessor]
  })

  if (args.leastSquares) args.lsLine = leastSquares(x, y)
}
