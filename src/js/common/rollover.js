function mg_clear_mouseover_container (svg) {
  svg.selectAll('.mg-active-datapoint-container').selectAll('*').remove()
}

function mg_setup_mouseover_container (svg, args) {
  svg.select('.mg-active-datapoint').remove()
  var text_anchor = args.mouseover_align === 'right'
    ? 'end'
    : (args.mouseover_align === 'left'
      ? 'start'
      : 'middle')

  var mouseover_x = (args.mouseover_align === 'right')
    ? getPlotRight(args)
    : (args.mouseover_align === 'left'
      ? getPlotLeft(args)
      : (args.width - args.left - args.right) / 2 + args.left)

  var active_datapoint = svg.select('.mg-active-datapoint-container')
    .attr('transform', 'translate(0 -18)')
    .append('text')
    .attr('class', 'mg-active-datapoint')
    .attr('xml:space', 'preserve')
    .attr('text-anchor', text_anchor)

  // set the rollover text's position; if we have markers on two lines,
  // nudge up the rollover text a bit
  var active_datapoint_y_nudge = 0.75

  var y_position = (args.x_axis_position === 'bottom')
    ? args.top * active_datapoint_y_nudge
    : getBottom(args) + args.buffer * 3

  if (args.markers) {
    var yPos
    svg.selectAll('.mg-marker-text')
      .each(function () {
        if (!yPos) {
          yPos = d3.select(this).attr('y')
        } else if (yPos !== d3.select(this).attr('y')) {
          active_datapoint_y_nudge = 0.56
        }
      })
  }

  active_datapoint
    .attr('transform', 'translate(' + mouseover_x + ',' + (y_position) + ')')
}

function mg_mouseover_tspan (svg, text) {
  const tspan = svg.append('tspan').text(text)

  return {
    bold: () => tspan.attr('font-weight', 'bold'),
    font_size: (pts) => tspan.attr('font-size', pts),
    x: (x) => tspan.attr('x', x),
    y: (y) => tspan.attr('y', y),
    elem: tspan
  }
}

function mg_reset_text_container (svg) {
  var textContainer = svg.select('.mg-active-datapoint')
  textContainer
    .selectAll('*')
    .remove()
  return textContainer
}

function mg_mouseover_row (row_number, container, rargs) {
  var lineHeight = 1.1
  var rrr = container.append('tspan')
    .attr('x', 0)
    .attr('y', (row_number * lineHeight) + 'em')

  return {
    rargs,
    text: (text) => {
      return mg_mouseover_tspan(rrr, text)
    }
  }
}

function mg_mouseover_text (args, rargs) {
  mg_setup_mouseover_container(rargs.svg, args)

  const mouseOver = {
    row_number: 0,
    rargs,
    mouseover_row: (rargs) => {
      mouseOver.row_number += 1
      return mg_mouseover_row(mouseOver.row_number, mouseOver.text_container, rargs)
    },
    text_container: mg_reset_text_container(rargs.svg)
  }

  return mouseOver
}
