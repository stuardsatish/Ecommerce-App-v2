import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useThemeColors } from '@/hooks/useThemeColors';
import { confirmAction } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import {
  answerQuestion,
  askQuestion,
  deleteAnswer,
  deleteQuestion,
  fetchProductQA,
} from '@/services/reviewsPlus';
import { relativeDate } from '@/utils/relativeTime';

const COLLAPSED_COUNT = 3;
const MAX_QUESTION = 500;
const MAX_ANSWER = 1000;
// Mirror the server's CHECK constraints so the button isn't enabled for text
// it will refuse.
const MIN_QUESTION = 5;
const MIN_ANSWER = 2;

function Composer({ value, onChange, onSubmit, onCancel, busy, placeholder, submitLabel, max, min }) {
  const c = useThemeColors();
  const ready = value.trim().length >= min;
  return (
    <View className="gap-2 rounded-xl bg-surface-muted p-3">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        multiline
        maxLength={max}
        textAlignVertical="top"
        editable={!busy}
        accessibilityLabel={placeholder}
        className="min-h-[64px] rounded-lg border border-border bg-surface p-3 font-sans text-sm text-ink"
      />
      <View className="flex-row items-center justify-between gap-3">
        <Text className="font-sans text-[11px] text-muted">
          {value.length}/{max}
        </Text>
        <View className="flex-row items-center gap-2">
          {onCancel ? (
            <Pressable onPress={onCancel} disabled={busy} className="px-3 py-2 active:opacity-60">
              <Text className="font-sans-semibold text-xs text-muted">Cancel</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onSubmit}
            disabled={busy || !ready}
            accessibilityRole="button"
            className="rounded-full bg-primary px-5 py-2 active:opacity-80"
            style={{ opacity: busy || !ready ? 0.5 : 1 }}>
            <Text className="font-sans-bold text-xs text-inverse">{busy ? 'Posting…' : submitLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function DeleteLink({ onPress, disabled, label }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="active:opacity-60"
      style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text className="font-sans-semibold text-[11px] text-error">Delete</Text>
    </Pressable>
  );
}

/**
 * Customer questions and answers for a product, shown under the reviews.
 * Renders nothing until the Q&A backend answers, and nothing at all when it
 * isn't there (`available: false`) — so an app build running ahead of the
 * database migration just doesn't show the section.
 *
 * Permissions come from the server (`product_qa_permissions`): anyone signed
 * in may ask, only the store's staff and buyers of the product may answer, and
 * you can delete your own posts (staff can delete any).
 * @param {{ productId: string, userId?: string }} props
 */
export function ProductQA({ productId, userId }) {
  const [data, setData] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answeringId, setAnsweringId] = useState(null);
  const [answer, setAnswer] = useState('');
  const [answerBusy, setAnswerBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Permissions depend on who is signed in, so re-fetch when that changes.
  useEffect(() => {
    let active = true;
    fetchProductQA(productId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((err) => {
        console.warn('Product Q&A fetch error:', err?.message || err);
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, [productId, userId, reloadKey]);

  if (!data || !data.available) return null;

  const { permissions, questions } = data;
  const reload = () => setReloadKey((k) => k + 1);
  const visible = showAll ? questions : questions.slice(0, COLLAPSED_COUNT);

  const handleAsk = async () => {
    setAsking(true);
    try {
      await askQuestion(productId, question.trim());
      setQuestion('');
      toast.success('Your question has been posted.');
      reload();
    } catch (err) {
      toast.error(err?.message || 'Could not post your question.');
    } finally {
      setAsking(false);
    }
  };

  const handleAnswer = async (questionId) => {
    setAnswerBusy(true);
    try {
      await answerQuestion(questionId, answer.trim());
      setAnsweringId(null);
      setAnswer('');
      toast.success('Your answer has been posted.');
      reload();
    } catch (err) {
      toast.error(err?.message || 'Could not post your answer.');
    } finally {
      setAnswerBusy(false);
    }
  };

  const handleDelete = async (kind, id) => {
    const isQuestion = kind === 'question';
    const ok = await confirmAction({
      title: isQuestion ? 'Delete this question?' : 'Delete this answer?',
      message: isQuestion ? 'Its answers will be removed too.' : 'This cannot be undone.',
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await (isQuestion ? deleteQuestion(id) : deleteAnswer(id));
      toast.success(isQuestion ? 'Question deleted.' : 'Answer deleted.');
      reload();
    } catch (err) {
      toast.error(err?.message || 'Could not delete it.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <View className="gap-4 border-t border-border pt-6">
      <View className="flex-row items-baseline gap-2">
        <Text className="font-sans-semibold text-lg text-ink">Questions & Answers</Text>
        <Text className="font-sans-medium text-xs text-muted">({questions.length})</Text>
      </View>

      {!userId ? (
        <View className="items-start gap-3 rounded-xl bg-surface-muted p-4">
          <Text className="font-sans text-sm text-body">Have a question about this product?</Text>
          <Pressable
            onPress={() => router.push('/login')}
            accessibilityRole="button"
            className="rounded-full bg-primary px-5 py-2.5 active:opacity-80">
            <Text className="font-sans-bold text-xs text-inverse">Sign in to ask a question</Text>
          </Pressable>
        </View>
      ) : !permissions.canAsk ? (
        <View className="rounded-xl bg-surface-muted p-4">
          <Text className="font-sans text-sm text-body">
            Asking questions isn&apos;t available for this account right now.
          </Text>
        </View>
      ) : (
        <Composer
          value={question}
          onChange={setQuestion}
          onSubmit={handleAsk}
          busy={asking}
          placeholder="Ask a question about this product…"
          submitLabel="Post question"
          max={MAX_QUESTION}
          min={MIN_QUESTION}
        />
      )}

      {questions.length === 0 ? (
        <Text className="text-center font-sans text-[13px] text-muted">
          No questions yet. Be the first to ask!
        </Text>
      ) : (
        visible.map((q) => (
          <View key={q.id} className="gap-2 rounded-xl bg-surface p-4">
            <Text className="font-sans-semibold text-sm text-ink">{q.question}</Text>
            <View className="flex-row items-center justify-between gap-3">
              <Text className="flex-1 font-sans-medium text-[11px] text-muted">
                Asked by {q.asker} · {relativeDate(q.createdAt)}
              </Text>
              {q.isMine || permissions.isStaff ? (
                <DeleteLink
                  label="Delete question"
                  disabled={deletingId === q.id}
                  onPress={() => handleDelete('question', q.id)}
                />
              ) : null}
            </View>

            {q.answers.map((a) => (
              <View key={a.id} className="mt-1 gap-1 border-l-2 border-border-strong pl-3">
                <Text className="font-sans text-sm leading-5 text-body">{a.answer}</Text>
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 flex-row flex-wrap items-center gap-1.5">
                    <Text className="font-sans-medium text-[11px] text-muted">
                      {a.answerer} · {relativeDate(a.createdAt)}
                    </Text>
                    {a.isStaff ? (
                      <View className="rounded bg-primary px-1.5 py-0.5">
                        <Text className="font-sans-bold text-[10px] text-inverse">Store</Text>
                      </View>
                    ) : null}
                  </View>
                  {a.isMine || permissions.isStaff ? (
                    <DeleteLink
                      label="Delete answer"
                      disabled={deletingId === a.id}
                      onPress={() => handleDelete('answer', a.id)}
                    />
                  ) : null}
                </View>
              </View>
            ))}

            {permissions.canAnswer ? (
              answeringId === q.id ? (
                <Composer
                  value={answer}
                  onChange={setAnswer}
                  onSubmit={() => handleAnswer(q.id)}
                  onCancel={() => {
                    setAnsweringId(null);
                    setAnswer('');
                  }}
                  busy={answerBusy}
                  placeholder="Write your answer…"
                  submitLabel="Post answer"
                  max={MAX_ANSWER}
                  min={MIN_ANSWER}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setAnsweringId(q.id);
                    setAnswer('');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Answer this question"
                  className="self-start active:opacity-60">
                  <Text className="font-sans-bold text-xs text-primary">Answer</Text>
                </Pressable>
              )
            ) : null}
          </View>
        ))
      )}

      {questions.length > COLLAPSED_COUNT ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          accessibilityRole="button"
          className="items-center rounded-full border border-border py-3 active:opacity-70">
          <Text className="font-sans-semibold text-sm text-body">
            {showAll ? 'Show fewer questions' : `Show all ${questions.length} questions`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}