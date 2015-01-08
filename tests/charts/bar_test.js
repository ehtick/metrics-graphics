module('Bar Chart');

var target = '#qunit-fixture',
  defaults = {
    target: target,
    chart_type: 'bar',
    data: [{
      label: 'Bar 1',
      value: 100
    },{
      label: 'Bar 2',
      value: 200
    },{
      label: 'Bar 3',
      value: 300
    }]
  };

test('correct number of bars', function() {
  MG.data_graphic(defaults);
  equal($('#qunit-fixture svg .bar').length, 3, 'should have 3 bars');
});

test('triggers callbacks when provided', function() {
  var mouseoverCalled = false,
    mousemoveCalled = false,
    mouseoutCalled = false,

    params = extend(defaults, {
      mouseover: function() {
        mouseoverCalled = true;
      },
      mousemove: function() {
        mousemoveCalled = true;
      },
      mouseout: function() {
        mouseoutCalled = true;
      }
    });

  MG.data_graphic(params);

  var bar = document.getElementsByClassName('bar-rollover')[0];

  bar.dispatchEvent(generateMouseEvent('mouseover'));
  equal(mouseoverCalled, true, 'mouseover was called');

  bar.dispatchEvent(generateMouseEvent('mousemove'));
  equal(mousemoveCalled, true, 'mousemove was called');

  bar.dispatchEvent(generateMouseEvent('mouseout'));
  equal(mouseoutCalled, true, 'mouseout was called');
});