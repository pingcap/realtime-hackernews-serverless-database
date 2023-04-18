import * as React from 'react';
import Box from '@mui/material/Box';
import { useRecoilValue, useRecoilState } from 'recoil';
import Container from '@mui/material/Container';
import AppBar from '@mui/material/AppBar';
import Stack from '@mui/material/Stack';
import CssBaseline from '@mui/material/CssBaseline';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import SendIcon from '@mui/icons-material/Send';
import { styled, alpha } from '@mui/material/styles';
import InputBase from '@mui/material/InputBase';
import Head from 'next/head';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LoadingButton from '@mui/lab/LoadingButton';
import CircularProgress from '@mui/material/CircularProgress';
import { useRouter } from 'next/router';

import 'github-markdown-css/github-markdown-light.css';

import {
  questionsState,
  questionLoadingState,
  questionDisableInputState,
} from 'src/recoil/atoms';
import {
  postAutoGPTAgents,
  getAutoGPTAgentLogs,
  postAutoGPTAgentFeedback,
} from 'src/api/autogpt/agents';
import type { AgentLogType } from 'pages/api/autogpt/agents/[id]/logs';
import { SearchInput } from 'src/components/Layout/QuestionHeader';
import { generateRandomString } from 'src/utils';
import { QuestionType } from 'src/types';

function AutoGPTSearchInput() {
  const [search, setSearch] = React.useState<string>('');

  const [questions, setQuestions] = useRecoilState(questionsState);
  const [loading, setLoading] = useRecoilState(questionLoadingState);
  const [disableInput, setDisableInput] = useRecoilState(
    questionDisableInputState
  );

  // const router = useRouter();

  const handleSearch = async (q: string) => {
    if (loading && questions.slice(-1)[0]) {
      setQuestions((prev) => [
        ...prev.slice(0, -1),
        {
          ...prev.slice(-1)[0],
          feedback: {
            q,
            id: generateRandomString(128),
            createdAt: new Date().toISOString(),
          },
        },
      ]);
      setDisableInput(true);
      await postAutoGPTAgentFeedback(questions.slice(-1)[0].id, q);
      return;
    }
    setLoading(true);
    setDisableInput(true);
    setQuestions((prev) => [
      ...prev,
      { q, id: generateRandomString(128), createdAt: new Date().toISOString() },
    ]);
  };

  // React.useEffect(() => {
  //   if (router.query?.search) {
  //     setSearch(decodeURIComponent(router.query?.search as string));
  //   }
  // }, [router.query?.search]);

  return (
    <SearchInput
      disabled={disableInput}
      value={search}
      onChange={(e) => {
        setSearch(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          handleSearch(search);
          setSearch('');
        }
      }}
      onClear={() => {
        setSearch('');
        handleSearch('');
      }}
    />
  );
}

export default function AutoGPTMessageGroup() {
  const questions = useRecoilValue(questionsState);

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '2rem',

          height: 'calc(100vh - 256px)',
          overflowY: 'auto',
          mb: '1rem',
        }}
      >
        {questions
          .slice()
          .reverse()
          .map((q, idx) => (
            <AutoGPTMessagePair key={`${q.id}`} question={q} />
          ))}
      </Box>
      <AutoGPTSearchInput />
    </Box>
  );
}

export function AutoGPTMessagePair(props: {
  question: QuestionType & { feedback?: Omit<QuestionType, 'agentId'> };
}) {
  const {
    question: { id: questionId, q, agentId: agentIdProp, feedback },
  } = props;

  const [agentId, setAgentId] = React.useState<number | null>(null);
  const [logs, setLogs] = React.useState<AgentLogType[] | null>(null);

  const [loading, setLoading] = useRecoilState(questionLoadingState);
  const [questions, setQuestions] = useRecoilState(questionsState);
  const [disableInput, setDisableInput] = useRecoilState(
    questionDisableInputState
  );

  React.useEffect(() => {
    const run = async () => {
      const res = await postAutoGPTAgents(q);
      const { id } = res;
      setAgentId(id);
      setQuestions((prev) => {
        const result = [];
        const idx = prev.findIndex((q) => q.id === questionId);
        if (idx !== -1) {
          result.push(...prev.slice(0, idx));
          result.push({ ...prev[idx], agentId: id });
          result.push(...prev.slice(idx + 1));
        } else {
          result.push(...prev);
        }
        return result;
      });
    };

    q && run();
  }, [q, questionId]);

  React.useEffect(() => {
    let stop = false;

    const run = async () => {
      if (stop) return;
      if (agentId) {
        const res = await getAutoGPTAgentLogs(agentId);
        setLogs(res);
        if (
          res[res.length - 1].status === 'task_complete' ||
          res[res.length - 1].log_level === 'error'
        ) {
          stop = true;
          setLoading(false);
        }
      }
    };

    const interval = setInterval(run, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [agentId]);

  const lastLogMemo = React.useMemo(() => {
    if (logs && logs.length > 0) {
      return logs[logs.length - 1];
    }
    return null;
  }, [logs]);

  const messagesMemo = React.useMemo(() => {
    const result = [];
    if (logs && logs.length > 0) {
      result.push(
        ...logs.map((log) => ({
          role: 'assistant',
          createAt: log.created_at,
          ele: (
            <ChatBubble
              key={`log-${log.id}`}
              role="assistant"
              content={log.content}
              error={log.log_level === 'error'}
            />
          ),
        }))
      );
    }
    if (feedback) {
      result.push({
        role: 'user',
        createAt: feedback.createdAt,
        ele: (
          <ChatBubble
            key={`user-${feedback.id}`}
            role="user"
            content={feedback.q}
          />
        ),
      });
    }
    return result;
  }, [logs, feedback]);

  React.useEffect(() => {
    if (lastLogMemo && lastLogMemo.status === 'wait_user_feedback') {
      setDisableInput(false);
    }
  }, [lastLogMemo]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <ChatBubble role="user" content={q} />

      {messagesMemo
        .sort((a, b) => a.createAt.localeCompare(b.createAt))
        .map((r) => r.ele)}

      {lastLogMemo &&
        ['loading', 'processing'].includes(lastLogMemo.status) && (
          <ChatBubble role="assistant">
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <CircularProgress size={20} />
            </Box>
          </ChatBubble>
        )}
    </Box>
  );
}

function ChatBubble(props: {
  content?: string;
  role: 'user' | 'assistant';
  children?: React.ReactNode;
  error?: boolean;
}) {
  const { role, content, error, children } = props;
  return (
    <>
      <Box
        sx={{
          display: 'flex',
          flexDirection: role === 'user' ? 'row-reverse' : 'row',
        }}
      >
        <Paper
          variant="outlined"
          sx={{
            px: '1rem',
            py: '0.5rem',
            maxWidth: '80%',
            borderRadius: '1rem',
            bgcolor: role === 'user' ? 'hn.primary' : 'background.paper',

            '& .markdown-body': {
              color: role === 'user' ? 'primary.contrastText' : 'text.primary',
              bgcolor: 'transparent',

              ...(error && {
                color: (theme) => theme.palette.error.main,
              }),
            },
          }}
        >
          {content && (
            <Box className="markdown-body">
              <ReactMarkdown rehypePlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </Box>
          )}
          <Box>{children}</Box>
        </Paper>
      </Box>
    </>
  );
}
