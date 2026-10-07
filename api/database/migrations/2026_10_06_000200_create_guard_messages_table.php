<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Everything the appointment guard has sent and received.
 *
 * The (booking_id, template) pair for outbound messages is what makes the
 * guard idempotent: the planner asks "has this booking had this message?" and
 * the unique index means two scheduler runs racing each other still send it
 * once. Inbound replies and acknowledgements are not unique — a customer can
 * write as often as they like.
 */
return new class extends Migration
{
    private const EVENT_TYPES = [
        'created', 'confirmed', 'rescheduled', 'cancelled',
        'completed', 'no_show', 'payment_recorded', 'note_added',
    ];

    public function up(): void
    {
        Schema::create('guard_messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('org_id');
            $table->uuid('booking_id');
            $table->enum('direction', ['out', 'in']);
            $table->string('template', 32);
            $table->text('body');
            $table->enum('intent', ['confirm', 'cancel', 'late', 'unknown'])->nullable();
            $table->boolean('needs_staff')->default(false);
            $table->string('channel', 32);
            $table->timestamp('sent_at');
            // Set only for the messages the planner keys on, so the index
            // constrains exactly those and nothing else.
            $table->string('once_key', 80)->nullable()->unique();

            $table->foreign('org_id')->references('id')->on('organizations')->cascadeOnDelete();
            $table->foreign('booking_id')->references('id')->on('bookings')->cascadeOnDelete();
            $table->index(['org_id', 'sent_at']);
            $table->index(['booking_id', 'sent_at']);
        });

        // Two things the guard records on a booking's history: the customer
        // confirming in their own words, and a slot released for silence.
        if (DB::getDriverName() === 'mysql') {
            $types = array_merge(self::EVENT_TYPES, ['customer_confirmed', 'released']);
            DB::statement("ALTER TABLE booking_events MODIFY type ENUM('".implode("','", $types)."') NOT NULL");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('guard_messages');

        if (DB::getDriverName() === 'mysql') {
            DB::table('booking_events')->whereIn('type', ['customer_confirmed', 'released'])->update(['type' => 'note_added']);
            DB::statement("ALTER TABLE booking_events MODIFY type ENUM('".implode("','", self::EVENT_TYPES)."') NOT NULL");
        }
    }
};
