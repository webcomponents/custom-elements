/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

'use strict';

const compilerPackage = require('google-closure-compiler');
const gulp = require('gulp');
const sourcemaps = require('gulp-sourcemaps');

const closureCompiler = compilerPackage.gulp();

const gulpTask = (closureOptions = {}) => {
  return gulp.src('./src/**/*.js', {base: './'})
    .pipe(sourcemaps.init())
    .pipe(closureCompiler(Object.assign({
      compilation_level: 'ADVANCED',
      warning_level: 'VERBOSE',
      language_in: 'ECMASCRIPT6_STRICT',
      externs: ['externs/custom-elements.js'],
      dependency_mode: 'STRICT',
      output_wrapper: '(function(){\n%output%\n}).call(self);',
      assume_function_wrapper: true,
      new_type_inf: true,
      rewrite_polyfills: false,
    }, closureOptions)))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('./'));
};

const buildPolyfill = () => gulpTask({
  entry_point: ['/src/custom-elements'],
  js_output_file: 'custom-elements.min.js',
  language_out: 'ECMASCRIPT5_STRICT',
});

const buildNativeShim = () => gulpTask({
  entry_point: ['/src/native-shim'],
  js_output_file: 'native-shim.min.js',
  language_out: 'ECMASCRIPT6_STRICT',
});

gulp.task('default', gulp.series(buildPolyfill, buildNativeShim));
