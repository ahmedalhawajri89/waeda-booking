<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Booking a place, not only a person.
 *
 * A padel court is booked for 60, 90 or 120 minutes, at one price in the
 * afternoon and another after five, and the same group takes it every
 * Tuesday. So: a resource can be a place; a service can offer durations and
 * a peak price; a booking keeps the duration chosen (null: the service's),
 * and weekly repeats share a series.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('resources', function (Blueprint $table) {
            $table->string('kind', 8)->default('person')->after('gender');
        });
        Schema::table('services', function (Blueprint $table) {
            $table->json('duration_options')->nullable()->after('duration_min');
            $table->time('peak_from')->nullable()->after('price_minor');
            $table->unsignedInteger('peak_price_minor')->nullable()->after('peak_from');
        });
        Schema::table('bookings', function (Blueprint $table) {
            $table->unsignedSmallInteger('duration_min')->nullable()->after('end_at');
            $table->uuid('series_id')->nullable()->after('duration_min');
            $table->index('series_id');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $t) => $t->dropColumn(['duration_min', 'series_id']));
        Schema::table('services', fn (Blueprint $t) => $t->dropColumn(['duration_options', 'peak_from', 'peak_price_minor']));
        Schema::table('resources', fn (Blueprint $t) => $t->dropColumn('kind'));
    }
};
