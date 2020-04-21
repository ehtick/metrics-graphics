import { isArrayOfArrays, isArrayOfObjectsOrEmpty, getWidth, getHeight, randomId, makeAccessorFunction } from '../misc/utility'
import { select } from 'd3-selection'
import Scale from '../components/scale'
import Axis from '../components/axis'
import Tooltip from '../components/tooltip'
import { schemeCategory10 } from 'd3-scale-chromatic'
import Legend from '../components/legend'
import { extent } from 'd3-array'
import Point from '../components/point'

/**
 * This abstract chart class implements all functionality that is shared between all available chart types.
 * This is not meant to be directly instantiated.
 *
 * @param {Object} args argument object.
 * @param {Array} args.data data that needs to be visualized.
 * @param {String | Object} args.target DOM node to which the graph should be mounted. Either D3 selection or D3 selection specifier.
 * @param {Number} args.width total width of the graph.
 * @param {Number} args.height total height of the graph.
 * @param {Array} [args.markers=[]] markers that should be added to the chart. Each marker object should be accessible through the xAccessor and contain a label field.
 * @param {String | Function} [args.xAccessor=d=>d] either name of the field that contains the x value or function that receives a data object and returns its x value.
 * @param {String | Function} [args.yAccessor=d=>d] either name of the field that contains the y value or function that receives a data object and returns its y value.
 * @param {Object} [args.margin={ top: 10, left: 60, right: 20, bottom: 40 }] margin object specifying top, bottom, left and right margin.
 * @param {Number} [args.buffer=10] amount of buffer between the axes and the graph.
 * @param {String | Array} [args.color] custom color scheme for the graph.
 * @param {String | Array} [args.colors=schemeCategory10] alternative to color.
 * @param {Object} [args.xScale] object that can be used to overwrite parameters of the auto-generated x {@link Scale}.
 * @param {Object} [args.yScale] object that can be used to overwrite parameters of the auto-generated y {@link Scale}.
 * @param {Object} [args.xAxis] object that can be used to overwrite parameters of the auto-generated x {@link Axis}.
 * @param {Object} [args.yAxis] object that can be used to overwrite parameters of the auto-generated y {@link Axis}.
 * @param {Boolean} [args.showTooltip] whether or not to show a tooltip.
 * @param {Function} [args.tooltipFunction] function that receives a data object and returns the string displayed as tooltip.
 * @param {Array} [args.legend] names of the sub-arrays of data, used as legend labels.
 * @param {String | Object} [args.legendTarget] DOM node to which the legend should be mounted.
 */
export default class AbstractChart {
  id = null

  // base chart fields
  data = null
  markers = []
  target = null
  svg = null
  container = null

  // accessors
  xAccessor = null
  yAccessor = null
  colors = []

  // scales
  xScale = null
  yScale = null

  // axes
  xAxis = null
  yAxis = null

  // tooltip and legend stuff
  tooltip = null
  legend = null
  legendTarget = null

  // dimensions
  width = 0
  height = 0
  isFullWidth = false
  isFullHeight = false

  // margins
  margin = { top: 10, left: 60, right: 20, bottom: 40 }
  buffer = 10

  // data type flags
  isSingleObject = false
  isArrayOfObjects = false
  isArrayOfArrays = false
  isNestedArrayOfArrays = false
  isNestedArrayOfObjects = false

  constructor ({
    data,
    target,
    markers,
    xAccessor = 'date',
    yAccessor = 'value',
    margin,
    buffer,
    width,
    height,
    color,
    colors,
    xScale,
    yScale,
    xAxis,
    yAxis,
    showTooltip,
    tooltipFunction,
    legend,
    legendTarget,
    ...custom
  }) {
    // set parameters
    this.data = data
    this.target = target
    this.markers = markers ?? this.markers
    this.legend = legend ?? this.legend
    this.legendTarget = legendTarget ?? this.legendTarget

    // convert string accessors to functions if necessary
    this.xAccessor = makeAccessorFunction(xAccessor)
    this.yAccessor = makeAccessorFunction(yAccessor)
    this.margin = margin ?? this.margin
    this.buffer = buffer ?? this.buffer

    // set unique id for chart
    this.id = randomId()

    // compute dimensions
    this.width = getWidth(this.isFullWidth, width, this.target)
    this.height = getHeight(this.isFullHeight, height, this.target)

    // normalize color and colors arguments
    this.colors = color ? [color] : colors ? [colors] : schemeCategory10

    this.setDataTypeFlags()

    // attach base elements to svg
    this.mountSvg()

    // set up scales
    this.xScale = new Scale({ range: [0, this.innerWidth], ...xScale })
    this.yScale = new Scale({ range: [this.innerHeight, 0], ...yScale })

    // normalize data if necessary
    this.normalizeData()
    this.computeDomains(custom)

    // set up axes if not disabled
    this.mountXAxis(xAxis)
    this.mountYAxis(yAxis)

    // pre-attach tooltip text container
    this.mountTooltip(showTooltip, tooltipFunction)

    // set up main container
    this.mountContainer()
  }

  /**
   * Mount a new legend if necessary
   * @param {String} symbolType symbol type (circle, square, line)
   * @returns {void}
   */
  mountLegend (symbolType) {
    if (!this.legend || !this.legend.length || !this.legendTarget) return
    const legend = new Legend({
      legend: this.legend,
      colorScheme: this.colors,
      symbolType
    })
    legend.mountTo(this.legendTarget)
  }

  /**
   * Mount new x axis.
   *
   * @param {Object} [xAxis] object that can be used to overwrite parameters of the auto-generated x {@link Axis}.
   * @returns {void}
   */
  mountXAxis (xAxis) {
    if (typeof xAxis?.show !== 'undefined' && !xAxis.show) return
    this.xAxis = new Axis({
      scale: this.xScale,
      orientation: 'bottom',
      top: this.bottom,
      left: this.left,
      height: this.innerHeight,
      buffer: this.buffer,
      ...xAxis
    })
    if (!xAxis?.tickFormat) this.computeXAxisType()

    // attach axis
    if (this.xAxis) this.xAxis.mountTo(this.svg)
  }

  /**
   * Mount new y axis.
   *
   * @param {Object} [yAxis] object that can be used to overwrite parameters of the auto-generated y {@link Axis}.
   * @returns {void}
   */
  mountYAxis (yAxis) {
    if (typeof yAxis?.show !== 'undefined' && !Axis.show) return
    this.yAxis = new Axis({
      scale: this.yScale,
      orientation: 'left',
      top: this.top,
      left: this.left,
      height: this.innerWidth,
      buffer: this.buffer,
      ...yAxis
    })
    if (!yAxis?.tickFormat) this.computeYAxisType()
    if (this.yAxis) this.yAxis.mountTo(this.svg)
  }

  /**
   * Mount a new tooltip if necessary.
   *
   * @param {Boolean} [showTooltip] whether or not to show a tooltip.
   * @param {Function} [tooltipFunction] function that receives a data object and returns the string displayed as tooltip.
   * @returns {void}
   */
  mountTooltip (showTooltip, tooltipFunction) {
    if (typeof showTooltip !== 'undefined' && !showTooltip) return
    this.tooltip = new Tooltip({
      top: this.buffer,
      left: this.width - 2 * this.buffer,
      xAccessor: this.xAccessor,
      yAccessor: this.yAccessor,
      textFunction: tooltipFunction,
      colors: this.colors,
      legend: this.legend
    })
    this.tooltip.mountTo(this.svg)
  }

  /**
   * Mount the main container.
   * @returns {void}
   */
  mountContainer () {
    this.container = this.svg
      .append('g')
      .attr('transform', `translate(${this.left},${this.top})`)
      .attr('clip-path', `url(#mg-plot-window-${this.id})`)
      .append('g')
      .attr('transform', `translate(${this.buffer},${this.buffer})`)
  }

  /**
   * This method is called by the abstract chart constructor.
   * In order to simplify parsing of passed data, set flags specifying what types of data we're dealing with.
   * @returns {void}
   */
  setDataTypeFlags () {
    // case 1: data is just one object, e.g. for bar chart
    if (!Array.isArray(this.data)) {
      this.isSingleObject = true
      return
    }

    // case 2: data is array of objects
    if (!isArrayOfArrays(this.data)) {
      this.isArrayOfObjects = true
      return
    }

    // case 3: data is at least array of arrays
    this.isArrayOfArrays = true

    // case 4: nested array of objects
    this.isNestedArrayOfObjects = this.data.every(da => isArrayOfObjectsOrEmpty(da))

    // case 5: nested array of arrays
    this.isNestedArrayOfArrays = this.data.every(da => isArrayOfArrays(da))
  }

  /**
   * This method is called by the abstract chart constructor.
   * Append the local svg node to the specified target, if necessary.
   * Return existing svg node if it's already present.
   * @returns {void}
   */
  mountSvg () {
    const svg = select(this.target).select('svg')
    this.svg = (!svg || svg.empty())
      ? select(this.target)
        .append('svg')
        .classed('mg-graph', true)
        .attr('width', this.width)
        .attr('height', this.height)
      : svg

    // prepare clip path
    this.svg.selectAll('.mg-clip-path').remove()
    this.svg.append('defs')
      .attr('class', 'mg-clip-path')
      .append('clipPath')
      .attr('id', `mg-plot-window-${this.id}`)
      .append('svg:rect')
      .attr('width', this.width - this.margin.left - this.margin.right)
      .attr('height', this.height - this.margin.top - this.margin.bottom)

    // set viewbox
    this.svg.attr('viewBox', `0 0 ${this.width} ${this.height}`)
    if (this.isFullWidth || this.isFullHeight) {
      this.svg.attr('preserveAspectRatio', 'xMinYMin meet')
    }
  }

  /**
   * If needed, charts can implement data normalizations, which are applied when instantiating a new chart.
   * @returns {void}
   */
  normalizeData () {}

  /**
   * Usually, the domains of the chart's scales depend on the chart type and the passed data, so this should usually be overwritten by chart implementations.
   * @param {Object} params object of custom parameters for the specific chart type
   * @returns {void}
   */
  computeDomains (params) {
    const flatData = this.data.flat()
    const xExtent = extent(flatData, this.xAccessor)
    const yExtent = extent(flatData, this.yAccessor)
    this.xScale.domain = xExtent
    this.yScale.domain = yExtent
  }

  /**
   * Meant to be overwritten by chart implementations.
   * Set tick format of the x axis.
   * @returns {void}
   */
  computeXAxisType () {}

  /**
   * Meant to be overwritten by chart implementations.
   * Set tick format of the y axis.
   * @returns {void}
   */
  computeYAxisType () {}

  generatePoint (args) {
    return new Point({
      xAccessor: this.xAccessor,
      yAccessor: this.yAccessor,
      xScale: this.xScale,
      yScale: this.yScale,
      ...args
    })
  }

  get top () { return this.margin.top }
  get left () { return this.margin.left }
  get bottom () { return this.height - this.margin.bottom }

  // returns the pixel location of the respective side of the plot area.
  get plotTop () { return this.top + this.buffer }
  get plotLeft () { return this.left + this.buffer }

  get innerWidth () { return this.width - this.margin.left - this.margin.right - 2 * this.buffer }
  get innerHeight () { return this.height - this.margin.top - this.margin.bottom - 2 * this.buffer }
}
